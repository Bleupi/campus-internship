import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

function uniqueEmail(): string {
  return `e2e.students.${randomUUID()}@u-paris.fr`;
}

// Same gap as auth.e2e-spec.ts: @types/superagent types set-cookie as a
// plain string, but Node preserves repeated Set-Cookie headers as an array.
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

describe("Students profile (e2e)", () => {
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
    // Cascades to StudentProfile/FileObject (schema.prisma: onDelete: Cascade)
    // but NOT to the underlying MinIO objects the tests upload — see
    // docs/ROADMAP_V2.md "Local/dev cleanup for test-uploaded certificates".
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await app.close();
  });

  async function signupAndGetAccessToken(): Promise<string> {
    const email = uniqueEmail();
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName: "Dupont",
      })
      .expect(201);
    return requireCookie(cookieMap(response), "access_token");
  }

  function authCookie(accessToken: string): string {
    return cookieHeader({ access_token: accessToken });
  }

  it("GET /students/me/profile: 401 without a cookie", async () => {
    await request(app.getHttpServer()).get("/students/me/profile").expect(401);
  });

  it("GET /students/me/profile: 200 right after signup — INCOMPLETE, no promotion, no files", async () => {
    const accessToken = await signupAndGetAccessToken();

    const response = await request(app.getHttpServer())
      .get("/students/me/profile")
      .set("Cookie", authCookie(accessToken))
      .expect(200);

    expect(response.body).toEqual({
      promotion: null,
      phone: null,
      personalEmail: null,
      profileStatus: "INCOMPLETE",
      profileYear: null,
      files: [],
    });
  });

  it("PATCH /students/me/profile: 400 on an invalid body (malformed personalEmail), via the real ZodValidationPipe", async () => {
    const accessToken = await signupAndGetAccessToken();

    await request(app.getHttpServer())
      .patch("/students/me/profile")
      .set("Cookie", authCookie(accessToken))
      .send({ personalEmail: "not-an-email" })
      .expect(400);
  });

  it("PATCH /students/me/profile: updates phone/personalEmail without changing profileStatus", async () => {
    const accessToken = await signupAndGetAccessToken();

    const response = await request(app.getHttpServer())
      .patch("/students/me/profile")
      .set("Cookie", authCookie(accessToken))
      .send({ phone: "0612345678", personalEmail: "etu.perso@gmail.com" })
      .expect(200);

    expect(response.body).toMatchObject({
      phone: "0612345678",
      personalEmail: "etu.perso@gmail.com",
      profileStatus: "INCOMPLETE",
    });
  });

  it("POST .../id-photo: 400 on a disallowed MIME type", async () => {
    const accessToken = await signupAndGetAccessToken();

    await request(app.getHttpServer())
      .post("/students/me/profile/id-photo")
      .set("Cookie", authCookie(accessToken))
      .attach("file", Buffer.from("not-an-image"), {
        filename: "id.txt",
        contentType: "text/plain",
      })
      .expect(400);
  });

  it("POST .../id-photo: 413 on a file larger than the 5MB limit", async () => {
    const accessToken = await signupAndGetAccessToken();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);

    await request(app.getHttpServer())
      .post("/students/me/profile/id-photo")
      .set("Cookie", authCookie(accessToken))
      .attach("file", oversized, { filename: "id.png", contentType: "image/png" })
      .expect(413);
  });

  it("POST .../insurance-certificate: 400 on a disallowed MIME type (id-photo's MIME set doesn't leak into this endpoint)", async () => {
    const accessToken = await signupAndGetAccessToken();

    await request(app.getHttpServer())
      .post("/students/me/profile/insurance-certificate")
      .set("Cookie", authCookie(accessToken))
      .attach("file", Buffer.from("not-a-pdf"), {
        filename: "cert.png",
        contentType: "image/png",
      })
      .expect(400);
  });

  it("setting a promotion and uploading both files completes the profile: INCOMPLETE -> PENDING_VALIDATION", async () => {
    const accessToken = await signupAndGetAccessToken();

    await request(app.getHttpServer())
      .patch("/students/me/profile")
      .set("Cookie", authCookie(accessToken))
      .send({ promotion: "L3" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/students/me/profile/id-photo")
      .set("Cookie", authCookie(accessToken))
      .attach("file", Buffer.from("fake-id-photo-bytes"), {
        filename: "id.png",
        contentType: "image/png",
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/students/me/profile/insurance-certificate")
      .set("Cookie", authCookie(accessToken))
      .attach("file", Buffer.from("fake-certificate-bytes"), {
        filename: "cert.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    expect(response.body.profileStatus).toBe("PENDING_VALIDATION");
    expect(response.body.profileYear).not.toBeNull();
    expect(response.body.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ID_PHOTO", mimeType: "image/png" }),
        expect.objectContaining({ type: "INSURANCE_CERTIFICATE", mimeType: "application/pdf" }),
      ]),
    );
  });
});
