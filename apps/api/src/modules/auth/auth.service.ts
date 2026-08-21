import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, type User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import ms from "ms";
import type { AuthUser } from "shared";
import type { Env } from "../../config/env.schema";
import { PrismaService } from "../../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { SignupDto } from "./dto/signup.dto";

const BCRYPT_ROUNDS = 10;
const LOGIN_FAILURE_MESSAGE = "Email ou mot de passe incorrect";
const REFRESH_FAILURE_MESSAGE = "Session invalide, merci de vous reconnecter";

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

// Minimal shape both PrismaService and a $transaction callback's `tx` satisfy.
type Db = Pick<PrismaService, "user" | "refreshToken">;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async signup(dto: SignupDto): Promise<IssuedSession> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: ["STUDENT"],
          studentProfile: { create: { profileStatus: "INCOMPLETE" } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Un compte existe déjà avec cette adresse email");
      }
      throw error;
    }

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    return this.issueTokens(user);
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

  private async issueTokens(user: User, db: Db = this.prisma): Promise<IssuedSession> {
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
