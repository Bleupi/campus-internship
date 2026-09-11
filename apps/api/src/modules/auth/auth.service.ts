import { createHash, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StudentProfile, User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import ms from "ms";
import { getCurrentSchoolYear, type AuthUser, type ProfileStatus } from "shared";
import type { Env } from "../../config/env.schema";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import type { LoginDto } from "./dto/login.dto";
import type { SignupDto } from "./dto/signup.dto";

const BCRYPT_ROUNDS = 10;
const LOGIN_FAILURE_MESSAGE = "Email ou mot de passe incorrect";
const REFRESH_FAILURE_MESSAGE = "Session invalide, merci de vous reconnecter";
// BR-13: unknown, expired, and already-used reset tokens are indistinguishable
// to the caller — one generic message for all three.
const RESET_TOKEN_INVALID_MESSAGE = "Lien de réinitialisation invalide ou expiré";
const RESET_TOKEN_TTL_MS = 20 * 60 * 1000;
// BR-13 anti-enumeration, review follow-up on PR #81: a known email costs one
// extra DB round trip (the upsert) versus a bare lookup for an unknown one —
// a residual timing side channel on top of the already-unawaited email send.
// Padding every response to this floor keeps that gap out of the noise.
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 150;

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly mailerService: MailerService,
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
      // Diagnostic only (issue #75) — never log the password itself, and
      // this warn level keeps it out of Nest's error-severity alerting,
      // which is reserved for unhandled/5xx failures, not expected 401s.
      this.logger.warn(`Login failed, no user for email ${dto.email}`);
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      this.logger.warn(`Login failed, password mismatch for email ${dto.email}`);
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

  // BR-13. Whether or not `email` matches an account, the caller-facing
  // outcome (via AuthController) is identical — the real work below only
  // happens when a match exists, silently, so this method never signals
  // "found" vs. "not found" to its caller either.
  async forgotPassword(email: string): Promise<void> {
    // Padded to a fixed floor (FORGOT_PASSWORD_MIN_RESPONSE_MS) so the extra
    // DB round trip on the known-email path doesn't leak through response
    // timing — see that constant's comment.
    await Promise.all([this.processForgotPassword(email), sleep(FORGOT_PASSWORD_MIN_RESPONSE_MS)]);
  }

  private async processForgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = randomBytes(32).toString("hex");
    // Only one active token per account, reissued in place (same "in-place
    // update on a unique key, never a second row" pattern as ADR-0014).
    // Atomic via the userId unique constraint + Postgres ON CONFLICT —
    // unlike a separate deleteMany+create, two concurrent requests for the
    // same account can't both survive as distinct live tokens.
    await this.prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
      update: {
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // Trailing slash stripped: WEB_APP_URL is only validated as a URL
    // (env.schema.ts), not as slash-free — an operator setting it with one
    // would otherwise produce a malformed "//reset-password" link.
    const webAppUrl = this.configService.get("WEB_APP_URL", { infer: true }).replace(/\/+$/, "");
    const resetUrl = `${webAppUrl}/reset-password?token=${rawToken}`;
    // Not awaited (unlike resetPassword's confirmation email): awaiting the
    // outbound Scaleway call here would make a known email measurably
    // slower to respond to than an unknown one, a timing side channel that
    // defeats BR-13's anti-enumeration goal even though the response body
    // stays identical either way. sendMail() already catches its own
    // errors, so this is safe to leave unawaited.
    void this.sendMail(
      user.email,
      "Réinitialisation de votre mot de passe",
      this.composeResetEmail(user.firstName, resetUrl),
    );
  }

  // BR-13. Missing, expired, and already-consumed tokens are indistinguishable
  // to the caller: all three throw the same generic BadRequestException.
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new BadRequestException(RESET_TOKEN_INVALID_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      // Atomically claim the token: a concurrent request racing on the same
      // token sees this match 0 rows once the first has committed (the
      // DELETE's row lock serializes the two), instead of crashing on a
      // stale row after the fact. Replaces the pre-transaction findUnique
      // check as the actual authority — that earlier check above is now
      // only a fast-fail for an obviously invalid/expired token.
      const claimed = await tx.passwordResetToken.deleteMany({
        where: { id: stored.id, expiresAt: { gt: new Date() } },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(RESET_TOKEN_INVALID_MESSAGE);
      }

      const updatedUser = await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });
      // Revokes every stored RefreshToken (all devices need to log in again
      // to get a new session). This does NOT invalidate an access token
      // already issued: JwtStrategy checks only signature/expiry, no DB
      // lookup, so a JWT signed before the reset keeps working for up to
      // its own TTL (JWT_ACCESS_TTL, 15m by default) — review follow-up on
      // PR #81, tracked as a known gap rather than "fully force-logged-out".
      await tx.refreshToken.deleteMany({ where: { userId: stored.userId } });
      return updatedUser;
    });

    await this.sendMail(
      user.email,
      "Votre mot de passe a été modifié",
      this.composeConfirmationEmail(user.firstName),
    );
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

  // BR-13: by the time this is called the password change (or the decision
  // not to email anyone, for an unknown address) has already committed —
  // MailerService.sendSafely() owns the shared "catch, log, don't
  // propagate" policy (ADR-0026), the same one AdminStudentsService's
  // notifyStudent() delegates to for BR-11.
  private async sendMail(to: string, subject: string, text: string): Promise<void> {
    await this.mailerService.sendSafely({ to: { email: to }, subject, text }, this.logger);
  }

  // Locked copy (spec #78) — reused verbatim, never composed from paragraph
  // fragments like AdminStudentsService.composeEmail() does for BR-11.
  private composeResetEmail(firstName: string, resetUrl: string): string {
    return `Bonjour ${firstName},

Vous avez demandé la réinitialisation de votre mot de passe sur Gestion des stages.

Cliquez sur le lien suivant pour choisir un nouveau mot de passe. Ce lien est valable 20 minutes et ne peut être utilisé qu'une seule fois :

${resetUrl}

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email : votre mot de passe reste inchangé.

Cordialement,
L'équipe Gestion des stages

Cet email est envoyé automatiquement, merci de ne pas y répondre.`;
  }

  private composeConfirmationEmail(firstName: string): string {
    return `Bonjour ${firstName},

Votre mot de passe sur Gestion des stages vient d'être modifié.

Si vous êtes à l'origine de ce changement, vous n'avez rien à faire.

Si vous n'êtes pas à l'origine de cette modification, contactez l'administration au plus vite.

Cordialement,
L'équipe Gestion des stages

Cet email est envoyé automatiquement, merci de ne pas y répondre.`;
  }
}
