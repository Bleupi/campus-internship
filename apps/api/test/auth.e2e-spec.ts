import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ProfileStatus } from "@prisma/client";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

function uniqueEmail(): string {
  return `e2e.${randomUUID()}@etu.u-paris.fr`;
}

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await app.close();
  });

  function signup(email: string, password = "a-password-that-is-long-enough") {
    createdUserEmails.push(email);
    return request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email, password, firstName: "Étu", lastName: "Dupont" });
  }

  it("rejects signup with a non-@etu.u-paris.fr email (400)", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email: "etu@gmail.com",
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName: "Dupont",
      })
      .expect(400);
  });

  it("rejects signup with the old, incorrect @u-pariscite.fr domain (400)", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email: "etu@u-pariscite.fr",
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName: "Dupont",
      })
      .expect(400);
  });

  it("accepts a valid signup (201) and creates an INCOMPLETE profile", async () => {
    const email = uniqueEmail();
    const response = await signup(email).expect(201);

    expect(response.body.user.email).toBe(email);

    const profile = await prisma.studentProfile.findFirst({
      where: { user: { email } },
    });
    expect(profile?.profileStatus).toBe("INCOMPLETE");
    expect(profile?.promotion).toBeNull();
  });

  it("rejects a duplicate signup with the same email (409), translated by the global PrismaExceptionFilter", async () => {
    const email = uniqueEmail();
    await signup(email).expect(201);

    const response = await signup(email).expect(409);
    expect(response.body.message).toBe("Un compte existe déjà avec cette adresse email");
  });

  it("rejects login with the wrong password (401)", async () => {
    const email = uniqueEmail();
    await signup(email).expect(201);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "totally-the-wrong-password" })
      .expect(401);
  });

  it("logs in with correct credentials (200) and sets both cookies", async () => {
    const email = uniqueEmail();
    const password = "a-password-that-is-long-enough";
    await signup(email, password).expect(201);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = cookieMap(response);
    expect(cookies.access_token).toBeDefined();
    expect(cookies.refresh_token).toBeDefined();
  });

  it("/auth/me: 401 without a cookie, 200 with a valid access_token cookie", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);

    const email = uniqueEmail();
    const signupResponse = await signup(email).expect(201);
    const cookies = cookieMap(signupResponse);

    const meResponse = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookieHeader({ access_token: requireCookie(cookies, "access_token") }))
      .expect(200);

    expect(meResponse.body.user).toEqual({
      id: expect.any(String),
      email,
      firstName: "Étu",
      lastName: "Dupont",
      roles: ["STUDENT"],
    });
  });

  it("/auth/refresh: 401 with no/garbage cookie", async () => {
    await request(app.getHttpServer()).post("/auth/refresh").expect(401);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=garbage-not-a-real-token")
      .expect(401);
  });

  it("/auth/refresh: rotates a valid refresh token (200, new cookies), then rejects the replayed old one (401)", async () => {
    const email = uniqueEmail();
    const signupResponse = await signup(email).expect(201);
    const initialCookies = cookieMap(signupResponse);

    const refreshResponse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set(
        "Cookie",
        cookieHeader({ refresh_token: requireCookie(initialCookies, "refresh_token") }),
      )
      .expect(200);

    const rotatedCookies = cookieMap(refreshResponse);
    expect(rotatedCookies.access_token).toBeDefined();
    expect(rotatedCookies.refresh_token).toBeDefined();
    expect(rotatedCookies.refresh_token).not.toBe(initialCookies.refresh_token);

    // Replaying the now-rotated-away original refresh token must fail.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set(
        "Cookie",
        cookieHeader({ refresh_token: requireCookie(initialCookies, "refresh_token") }),
      )
      .expect(401);
  });

  describe("BR-06: lazy yearly rollover at login", () => {
    async function signupAndPrimeProfile(
      overrides: { profileStatus: ProfileStatus; profileYear: string },
      password = "a-password-that-is-long-enough",
    ) {
      const email = uniqueEmail();
      await signup(email, password).expect(201);
      await prisma.studentProfile.updateMany({
        where: { user: { email } },
        data: overrides,
      });
      return { email, password };
    }

    it("rolls a stale VALID profile to EXPIRED, reflected in both the response and the DB", async () => {
      const { email, password } = await signupAndPrimeProfile({
        profileStatus: "VALID",
        profileYear: "2000-2001",
      });

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      expect(response.body.profileStatus).toBe("EXPIRED");
      const profile = await prisma.studentProfile.findFirst({ where: { user: { email } } });
      expect(profile?.profileStatus).toBe("EXPIRED");
    });

    it("rolls a stale PENDING_VALIDATION profile to INCOMPLETE", async () => {
      const { email, password } = await signupAndPrimeProfile({
        profileStatus: "PENDING_VALIDATION",
        profileYear: "2000-2001",
      });

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      expect(response.body.profileStatus).toBe("INCOMPLETE");
      const profile = await prisma.studentProfile.findFirst({ where: { user: { email } } });
      expect(profile?.profileStatus).toBe("INCOMPLETE");
    });

    it("returns INCOMPLETE with no rollover for a freshly signed-up profile (null profileYear)", async () => {
      const email = uniqueEmail();
      const password = "a-password-that-is-long-enough";
      await signup(email, password).expect(201);

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      expect(response.body.profileStatus).toBe("INCOMPLETE");
    });
  });

  it("supports two concurrent sessions (two devices): logging out one leaves the other's refresh working", async () => {
    const email = uniqueEmail();
    const password = "a-password-that-is-long-enough";
    await signup(email, password).expect(201);

    const deviceALogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    const deviceBLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    const deviceACookies = cookieMap(deviceALogin);
    const deviceBCookies = cookieMap(deviceBLogin);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set(
        "Cookie",
        cookieHeader({ refresh_token: requireCookie(deviceACookies, "refresh_token") }),
      )
      .expect(204);

    // Device A's session is now revoked.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set(
        "Cookie",
        cookieHeader({ refresh_token: requireCookie(deviceACookies, "refresh_token") }),
      )
      .expect(401);

    // Device B's independent session still works.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set(
        "Cookie",
        cookieHeader({ refresh_token: requireCookie(deviceBCookies, "refresh_token") }),
      )
      .expect(200);
  });
});
