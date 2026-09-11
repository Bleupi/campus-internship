import { createHash } from "node:crypto";
import { BadRequestException, Logger, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import { AuthService } from "./auth.service";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const baseUser = {
  id: "user-1",
  email: "etu.dupont@etu.u-paris.fr",
  firstName: "Étu",
  lastName: "Dupont",
  roles: ["STUDENT"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AuthService", () => {
  let service: AuthService;
  let mailerService: { sendSafely: jest.Mock };
  let prisma: {
    user: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    passwordResetToken: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
    studentProfile: {
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      passwordResetToken: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      studentProfile: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg))),
    };

    mailerService = { sendSafely: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailerService },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue("signed.jwt.token") },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "JWT_REFRESH_TTL") return "7d";
              if (key === "JWT_ACCESS_TTL") return "15m";
              if (key === "WEB_APP_URL") return "http://localhost:5173";
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe("signup", () => {
    it("hashes the password before persisting (never stores it in plaintext)", async () => {
      prisma.user.create.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});

      await service.signup({
        email: baseUser.email,
        password: "a-very-long-plaintext-password",
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
      });

      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).not.toBe("a-very-long-plaintext-password");
      expect(createArgs.data.passwordHash.length).toBeGreaterThan(0);
    });

    it("creates the user with roles=[STUDENT] and an INCOMPLETE student profile", async () => {
      prisma.user.create.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});

      await service.signup({
        email: baseUser.email,
        password: "a-very-long-plaintext-password",
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
      });

      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.roles).toEqual(["STUDENT"]);
      expect(createArgs.data.studentProfile.create.profileStatus).toBe("INCOMPLETE");
    });

    it("lets a P2002 (duplicate email) Prisma error propagate for the global PrismaExceptionFilter to translate", async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
      prisma.user.create.mockRejectedValue(prismaError);

      await expect(
        service.signup({
          email: baseUser.email,
          password: "a-very-long-plaintext-password",
          firstName: baseUser.firstName,
          lastName: baseUser.lastName,
        }),
      ).rejects.toBe(prismaError);
    });

    it("returns the created user and issues an access + refresh token", async () => {
      prisma.user.create.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.signup({
        email: baseUser.email,
        password: "a-very-long-plaintext-password",
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
      });

      expect(result.user).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
        roles: baseUser.roles,
      });
      expect(result.accessToken).toBe("signed.jwt.token");
      expect(result.refreshToken).toEqual(expect.any(String));

      const refreshCreateArgs = prisma.refreshToken.create.mock.calls[0][0];
      expect(refreshCreateArgs.data.tokenHash).toBe(sha256(result.refreshToken));
      expect(refreshCreateArgs.data.userId).toBe(baseUser.id);
    });
  });

  describe("login", () => {
    it("succeeds with correct credentials and issues tokens", async () => {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("correct-password-that-is-long-enough", 10);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: baseUser.email,
        password: "correct-password-that-is-long-enough",
      });

      expect(result.user.email).toBe(baseUser.email);
      expect(result.accessToken).toBe("signed.jwt.token");
    });

    it("throws UnauthorizedException for an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "ghost@etu.u-paris.fr", password: "whatever-they-typed" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("logs a diagnostic warning distinguishing 'no user' from 'password mismatch' (issue #75), without ever logging the password", async () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();

      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: "ghost@etu.u-paris.fr", password: "super-secret-value" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no user"));

      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("the-real-password-is-long-enough", 10);
      prisma.user.findUnique.mockResolvedValueOnce({ ...baseUser, passwordHash });
      await expect(
        service.login({ email: baseUser.email, password: "super-secret-value" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("password mismatch"));

      const loggedText = warnSpy.mock.calls.map((call) => call[0]).join(" ");
      expect(loggedText).not.toContain("super-secret-value");

      warnSpy.mockRestore();
    });

    it("throws UnauthorizedException for a wrong password", async () => {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("the-real-password-is-long-enough", 10);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await expect(
        service.login({ email: baseUser.email, password: "totally-wrong-password" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("throws the same message for an unknown email and a wrong password (no user enumeration)", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      let unknownEmailMessage = "";
      try {
        await service.login({ email: "ghost@etu.u-paris.fr", password: "whatever-they-typed" });
      } catch (error) {
        unknownEmailMessage = (error as UnauthorizedException).message;
      }

      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("the-real-password-is-long-enough", 10);
      prisma.user.findUnique.mockResolvedValueOnce({ ...baseUser, passwordHash });
      let wrongPasswordMessage = "";
      try {
        await service.login({ email: baseUser.email, password: "totally-wrong-password" });
      } catch (error) {
        wrongPasswordMessage = (error as UnauthorizedException).message;
      }

      expect(unknownEmailMessage).toBe(wrongPasswordMessage);
      expect(unknownEmailMessage.length).toBeGreaterThan(0);
    });
  });

  describe("refresh", () => {
    it("rotates a valid, unexpired refresh token: old row deleted, new row + tokens issued", async () => {
      const rawToken = "a-raw-refresh-token";
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);
      prisma.refreshToken.delete.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh(rawToken);

      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: "rt-1" } });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(result.accessToken).toBe("signed.jwt.token");
      expect(result.refreshToken).not.toBe(rawToken);
    });

    it("throws UnauthorizedException when the token doesn't match any stored row", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh("garbage-token")).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("throws UnauthorizedException when the stored token has expired", async () => {
      const rawToken = "an-expired-refresh-token";
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-2",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.refresh(rawToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("login — BR-06 yearly rollover", () => {
    const studentUser = { ...baseUser, roles: ["STUDENT"] };

    async function loginWith(studentProfile: Record<string, unknown> | null) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("correct-password-that-is-long-enough", 10);
      prisma.user.findUnique.mockResolvedValue({
        ...studentUser,
        passwordHash,
        studentProfile,
      });
      prisma.refreshToken.create.mockResolvedValue({});
      return service.login({
        email: studentUser.email,
        password: "correct-password-that-is-long-enough",
      });
    }

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-15T00:00:00.000Z")); // 2025-2026
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("rolls a stale VALID profile to EXPIRED and persists it", async () => {
      const result = await loginWith({
        id: "profile-1",
        profileStatus: "VALID",
        profileYear: "2024-2025",
      });

      expect(result.profileStatus).toBe("EXPIRED");
      expect(prisma.studentProfile.update).toHaveBeenCalledWith({
        where: { id: "profile-1" },
        data: { profileStatus: "EXPIRED" },
      });
    });

    it("rolls a stale PENDING_VALIDATION profile to INCOMPLETE and persists it", async () => {
      const result = await loginWith({
        id: "profile-2",
        profileStatus: "PENDING_VALIDATION",
        profileYear: "2024-2025",
      });

      expect(result.profileStatus).toBe("INCOMPLETE");
      expect(prisma.studentProfile.update).toHaveBeenCalledWith({
        where: { id: "profile-2" },
        data: { profileStatus: "INCOMPLETE" },
      });
    });

    it("leaves a stale INCOMPLETE profile as INCOMPLETE, with no write", async () => {
      const result = await loginWith({
        id: "profile-3",
        profileStatus: "INCOMPLETE",
        profileYear: "2024-2025",
      });

      expect(result.profileStatus).toBe("INCOMPLETE");
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it("leaves an already-EXPIRED profile as EXPIRED, with no write", async () => {
      const result = await loginWith({
        id: "profile-4",
        profileStatus: "EXPIRED",
        profileYear: "2024-2025",
      });

      expect(result.profileStatus).toBe("EXPIRED");
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it("does not roll over, and does not write, when profileYear matches the current school year", async () => {
      const result = await loginWith({
        id: "profile-5",
        profileStatus: "VALID",
        profileYear: "2025-2026",
      });

      expect(result.profileStatus).toBe("VALID");
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it("returns a null profileStatus and never touches studentProfile for a user without one (e.g. a referent)", async () => {
      const result = await loginWith(null);

      expect(result.profileStatus).toBeNull();
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it("BR-01 half-open boundary: a login at exactly YYYY-09-01T00:00:00.000 triggers the rollover", async () => {
      jest.setSystemTime(new Date("2026-09-01T00:00:00.000Z")); // now 2026-2027
      const result = await loginWith({
        id: "profile-6",
        profileStatus: "VALID",
        profileYear: "2025-2026",
      });

      expect(result.profileStatus).toBe("EXPIRED");
    });

    it("BR-01 half-open boundary: a login at YYYY-08-31T23:59:59.999 does not trigger the rollover", async () => {
      jest.setSystemTime(new Date("2026-08-31T23:59:59.999Z")); // still 2025-2026
      const result = await loginWith({
        id: "profile-7",
        profileStatus: "VALID",
        profileYear: "2025-2026",
      });

      expect(result.profileStatus).toBe("VALID");
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("deletes only the RefreshToken row matching the presented token", async () => {
      const rawToken = "the-session-to-revoke";
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout(rawToken);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256(rawToken) },
      });
    });

    it("is idempotent when the token doesn't match anything (already logged out)", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.logout("already-used-token")).resolves.toBeUndefined();
    });
  });

  describe("forgotPassword — BR-13", () => {
    it("does nothing for an unknown email: no PasswordResetToken row, no email sent", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword("ghost@etu.u-paris.fr");

      expect(prisma.passwordResetToken.upsert).not.toHaveBeenCalled();
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });

    it("creates a hashed PasswordResetToken with an expiry ~20 minutes out for a known email", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-15T00:00:00.000Z"));
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.passwordResetToken.upsert.mockResolvedValue({});

      await service.forgotPassword(baseUser.email);

      expect(prisma.passwordResetToken.upsert).toHaveBeenCalledTimes(1);
      const upsertArgs = prisma.passwordResetToken.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({ userId: baseUser.id });
      expect(upsertArgs.create.userId).toBe(baseUser.id);
      expect(upsertArgs.create.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(upsertArgs.create.expiresAt.getTime() - Date.now()).toBe(20 * 60 * 1000);
      expect(upsertArgs.update.tokenHash).toBe(upsertArgs.create.tokenHash);
      expect(upsertArgs.update.expiresAt).toEqual(upsertArgs.create.expiresAt);

      jest.useRealTimers();
    });

    it("reissues any prior token for the account atomically (single upsert, not a separate delete+create)", async () => {
      // Only one Prisma call for the whole reissue: the userId unique
      // constraint makes this a single atomic DB operation (Postgres ON
      // CONFLICT) instead of two calls racing against a concurrent request.
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.passwordResetToken.upsert.mockResolvedValue({});

      await service.forgotPassword(baseUser.email);

      expect(prisma.passwordResetToken.upsert).toHaveBeenCalledTimes(1);
    });

    it("sends the reset email to user.email only, never to a StudentProfile.personalEmail on file", async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.passwordResetToken.upsert.mockResolvedValue({});

      await service.forgotPassword(baseUser.email);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      const sendArgs = mailerService.sendSafely.mock.calls[0][0];
      expect(sendArgs.to).toEqual({ email: baseUser.email });
      expect(sendArgs.cc).toBeUndefined();
    });

    // The "catch, log, don't propagate" policy itself now lives in
    // MailerService.sendSafely() (mailer.service.spec.ts) — this only
    // checks AuthService delegates to it rather than calling send()
    // directly (which would have no catch of its own here).
    it("delegates to MailerService.sendSafely(), not send() directly", async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.passwordResetToken.upsert.mockResolvedValue({});

      await service.forgotPassword(baseUser.email);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetPassword — BR-13", () => {
    const rawToken = "a-raw-reset-token";

    it("updates the password, deletes the token, and revokes every RefreshToken for a valid unexpired token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.resetPassword(rawToken, "a-brand-new-password-thats-long");

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: baseUser.id });
      expect(updateArgs.data.passwordHash).not.toBe("a-brand-new-password-thats-long");
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "prt-1", expiresAt: { gt: expect.any(Date) } },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id },
      });
    });

    it("rejects an expired token with a generic BadRequestException", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-2",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.resetPassword(rawToken, "a-brand-new-password-thats-long"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects with the same generic error when a concurrent request already claimed the token (TOCTOU)", async () => {
      // The pre-transaction findUnique still sees a live token (a second
      // request racing right behind a first one that already committed and
      // deleted the row) — the atomic claim inside the transaction is what
      // actually catches it, not the earlier check.
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-race",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resetPassword(rawToken, "a-brand-new-password-thats-long"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects an unknown/already-consumed token with the same generic error as an expired one", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      let unknownMessage = "";
      try {
        await service.resetPassword("garbage-token", "a-brand-new-password-thats-long");
      } catch (error) {
        unknownMessage = (error as BadRequestException).message;
      }

      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-3",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() - 60_000),
      });
      let expiredMessage = "";
      try {
        await service.resetPassword(rawToken, "a-brand-new-password-thats-long");
      } catch (error) {
        expiredMessage = (error as BadRequestException).message;
      }

      expect(unknownMessage).toBe(expiredMessage);
      expect(unknownMessage.length).toBeGreaterThan(0);
    });

    it("sends the confirmation email to user.email only, after a successful reset", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-4",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await service.resetPassword(rawToken, "a-brand-new-password-thats-long");

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      const sendArgs = mailerService.sendSafely.mock.calls[0][0];
      expect(sendArgs.to).toEqual({ email: baseUser.email });
      expect(sendArgs.cc).toBeUndefined();
    });

    // The "catch, log, don't propagate" policy itself now lives in
    // MailerService.sendSafely() (mailer.service.spec.ts) — this only
    // checks AuthService delegates to it rather than calling send()
    // directly (which would have no catch of its own here).
    it("delegates to MailerService.sendSafely(), not send() directly", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-5",
        tokenHash: sha256(rawToken),
        userId: baseUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await service.resetPassword(rawToken, "a-brand-new-password-thats-long");

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
    });
  });
});
