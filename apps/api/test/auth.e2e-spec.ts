import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

function uniqueEmail(): string {
  return `e2e.${randomUUID()}@u-paris.fr`;
}

// @types/superagent declares every header (including set-cookie) as a plain
// `string`, but Node's http actually preserves repeated Set-Cookie headers
// as an array at runtime — a known gap in the type declarations.
function extractSetCookie(response: request.Response): string[] {
  return (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
}

function cookieMap(response: request.Response): Record<string, string> {
  const map: Record<string, string> = {};
  for (const raw of extractSetCookie(response)) {
    const [pair = ""] = raw.split(";");
    const [name = "", value = ""] = pair.split("=");
    map[name] = value;
  }
  return map;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function requireCookie(cookies: Record<string, string>, name: string): string {
  const value = cookies[name];
  if (!value) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return value;
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

  it("rejects signup with a non-@u-paris.fr email (400)", async () => {
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
      .expect(200);

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
