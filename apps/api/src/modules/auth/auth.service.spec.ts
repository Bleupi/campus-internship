import { createHash } from "node:crypto";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "./auth.service";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const baseUser = {
  id: "user-1",
  email: "etu.dupont@u-paris.fr",
  firstName: "Étu",
  lastName: "Dupont",
  roles: ["STUDENT"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg))),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
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

    it("throws ConflictException when the email is already taken", async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        }),
      );

      await expect(
        service.signup({
          email: baseUser.email,
          password: "a-very-long-plaintext-password",
          firstName: baseUser.firstName,
          lastName: baseUser.lastName,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
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
        service.login({ email: "ghost@u-paris.fr", password: "whatever-they-typed" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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
        await service.login({ email: "ghost@u-paris.fr", password: "whatever-they-typed" });
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
});
