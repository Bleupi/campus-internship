import { createHash, randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StudentProfile, User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import ms from "ms";
import { getCurrentSchoolYear, type AuthUser, type ProfileStatus } from "shared";
import type { Env } from "../../config/env.schema";
import { PrismaService } from "../../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { SignupDto } from "./dto/signup.dto";

const BCRYPT_ROUNDS = 10;
const LOGIN_FAILURE_MESSAGE = "Email ou mot de passe incorrect";
const REFRESH_FAILURE_MESSAGE = "Session invalide, merci de vous reconnecter";

// BR-06: lazy yearly reset. Absent from this map, a status is left
// unchanged — INCOMPLETE has nowhere lower to go, and an already-EXPIRED
// profile stays EXPIRED until the student resolves it (see StudentsService).
const YEARLY_ROLLOVER_MAP: Partial<Record<ProfileStatus, ProfileStatus>> = {
  VALID: "EXPIRED",
  PENDING_VALIDATION: "INCOMPLETE",
};

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles as AuthUser["roles"],
  };
}

export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

// Minimal Prisma surface needed to issue a session: either PrismaService
// directly, or the `tx` client from a $transaction callback (see refresh()).
type SessionDb = Pick<PrismaService, "user" | "refreshToken">;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  // A duplicate email (P2002) is left to propagate — the global
  // PrismaExceptionFilter (common/filters/) translates it into a 409.
  async signup(dto: SignupDto): Promise<IssuedSession> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: ["STUDENT"],
        studentProfile: { create: { profileStatus: "INCOMPLETE" } },
      },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<IssuedSession & { profileStatus: ProfileStatus | null }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { studentProfile: true },
    });
    if (!user) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    // Independent: the rollover touches StudentProfile, token issuance
    // touches RefreshToken — running them concurrently halves the added
    // latency on the login hot path.
    const [profileStatus, session] = await Promise.all([
      this.applyYearlyRollover(user.studentProfile),
      this.issueTokens(user),
    ]);
    return { ...session, profileStatus };
  }

  async refresh(rawToken: string): Promise<IssuedSession> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(REFRESH_FAILURE_MESSAGE);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: stored.id } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: stored.userId } });
      return this.issueTokens(user, tx);
    });
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  // BR-06: evaluated lazily at login only, never on refresh — the login
  // response is the point where the frontend needs a fresh decision to
  // redirect. Referents/admins have no StudentProfile and are left alone.
  private async applyYearlyRollover(profile: StudentProfile | null): Promise<ProfileStatus | null> {
    if (!profile) return null;

    const currentStatus = profile.profileStatus as ProfileStatus;
    if (profile.profileYear === getCurrentSchoolYear()) {
      return currentStatus;
    }

    const rolledOverStatus = YEARLY_ROLLOVER_MAP[currentStatus];
    if (!rolledOverStatus) {
      return currentStatus;
    }

    await this.prisma.studentProfile.update({
      where: { id: profile.id },
      data: { profileStatus: rolledOverStatus },
    });
    return rolledOverStatus;
  }

  private async issueTokens(user: User, db: SessionDb = this.prisma): Promise<IssuedSession> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
    });

    const rawRefreshToken = randomBytes(32).toString("hex");
    const refreshTtl = this.configService.get("JWT_REFRESH_TTL", { infer: true });
    const refreshTtlMs = ms(refreshTtl as ms.StringValue);

    await db.refreshToken.create({
      data: {
        tokenHash: hashToken(rawRefreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { user: toAuthUser(user), accessToken, refreshToken: rawRefreshToken };
  }
}
