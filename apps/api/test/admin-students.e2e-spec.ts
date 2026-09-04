import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { MailerService } from "../src/modules/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap } from "./helpers/cookies";

function uniqueEmail(prefix: string): string {
  return `e2e.admin-students.${prefix}.${randomUUID()}@etu.u-paris.fr`;
}

// The certificate endpoint responds with an unregistered ("application/pdf")
// content type, which supertest/superagent doesn't buffer into `res.body`
// by default — this collects the raw bytes so tests can assert on them.
function binaryParser(res: request.Response, callback: (err: null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  (res as unknown as NodeJS.ReadableStream).on("data", (chunk: Buffer) => chunks.push(chunk));
  (res as unknown as NodeJS.ReadableStream).on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Admin profile-validation transitions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  let adminCookie: string;

  beforeAll(async () => {
    // The mailer boundary (ADR-0026) is swapped for a no-op stub — e2e runs
    // against a real test database/MinIO, but must never make a real
    // network call to Scaleway (no account is provisioned in CI/local dev).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    // No admin signup route exists (CLAUDE.md: no admin queue UI/route in
    // this slice either) — seed one directly, matching how the rest of the
    // system creates ADMIN users out of band.
    const adminEmail = uniqueEmail("admin");
    const adminPassword = "an-admin-password-long-enough";
    createdUserEmails.push(adminEmail);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        firstName: "Admin",
        lastName: "Test",
        roles: ["ADMIN"],
      },
    });
    const adminLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminCookie = cookieHeader(cookieMap(adminLogin));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await app.close();
  });

  // Creates a STUDENT user and puts their profile straight into the given
  // status via direct DB write. The INCOMPLETE -> PENDING_VALIDATION
  // transition itself is already covered by students.e2e-spec.ts — this
  // suite only needs "a profile currently at status X" as a precondition.
  async function studentWithProfile(
    profileStatus: "INCOMPLETE" | "PENDING_VALIDATION" | "VALID" | "EXPIRED",
  ): Promise<{ studentId: string; accessToken: string }> {
    const email = uniqueEmail("student");
    createdUserEmails.push(email);
    const signupResponse = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName: "Dupont",
      })
      .expect(201);
    const accessToken = cookieMap(signupResponse).access_token ?? "";

    const created = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email } } });
    const profile = await prisma.studentProfile.update({
      where: { id: created.id },
      data: { profileStatus, profileYear: "2025-2026", promotion: "L2" },
    });

    return { studentId: profile.id, accessToken };
  }

  // Uploads a real object to the (test) bucket via the actual student
  // upload endpoint — unlike studentWithProfile()'s direct DB write, this is
  // needed here because GET .../certificate reads the object back from S3
  // via FilesService.download(), not just the FileObject row.
  async function completeProfileWithRealCertificate(certificateBytes: string): Promise<string> {
    const email = uniqueEmail("cert-owner");
    createdUserEmails.push(email);
    const signupResponse = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName: "Dupont",
      })
      .expect(201);
    const accessToken = cookieMap(signupResponse).access_token ?? "";
    const authCookie = cookieHeader({ access_token: accessToken });

    await request(app.getHttpServer())
      .patch("/students/me/profile")
      .set("Cookie", authCookie)
      .send({ promotion: "L3" })
      .expect(200);
    await request(app.getHttpServer())
      .post("/students/me/profile/id-photo")
      .set("Cookie", authCookie)
      .attach("file", Buffer.from("fake-id-photo-bytes"), {
        filename: "id.png",
        contentType: "image/png",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/students/me/profile/insurance-certificate")
      .set("Cookie", authCookie)
      .attach("file", Buffer.from(certificateBytes), {
        filename: "cert.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    const profile = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email } } });
    return profile.id;
  }

  describe("RBAC — non-ADMIN caller is forbidden", () => {
    it("GET .../certificate: 403 for a STUDENT caller", async () => {
      const { studentId, accessToken } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .get(`/admin/students/${studentId}/profile/certificate`)
        .set("Cookie", cookieHeader({ access_token: accessToken }))
        .expect(403);
    });

    it("GET .../certificate: 401 with no cookie at all", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .get(`/admin/students/${studentId}/profile/certificate`)
        .expect(401);
    });

    it("PATCH .../validate: 403 for a STUDENT caller", async () => {
      const { studentId, accessToken } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/validate`)
        .set("Cookie", cookieHeader({ access_token: accessToken }))
        .expect(403);
    });

    it("PATCH .../reject: 403 for a STUDENT caller", async () => {
      const { studentId, accessToken } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", cookieHeader({ access_token: accessToken }))
        .send({ reason: "Certificat illisible" })
        .expect(403);
    });

    it("PATCH .../validate: 401 with no cookie at all", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/validate`)
        .expect(401);
    });
  });

  describe("GET .../certificate — issue #43 (ADR-0024): proxied stream, never a presigned URL", () => {
    it("200s and streams the current certificate's bytes with its stored mimeType", async () => {
      const studentId = await completeProfileWithRealCertificate("real-certificate-bytes");

      const response = await request(app.getHttpServer())
        .get(`/admin/students/${studentId}/profile/certificate`)
        .set("Cookie", adminCookie)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.body).toEqual(Buffer.from("real-certificate-bytes"));
    });

    it("404s when the student has no current (non-expired) certificate", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .get(`/admin/students/${studentId}/profile/certificate`)
        .set("Cookie", adminCookie)
        .expect(404);
    });

    it("404s for an unknown student id", async () => {
      await request(app.getHttpServer())
        .get(`/admin/students/${randomUUID()}/profile/certificate`)
        .set("Cookie", adminCookie)
        .expect(404);
    });
  });

  describe("PATCH .../validate — ADR-0004: PENDING_VALIDATION -> VALID", () => {
    it("200s and flips the profile to VALID", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      const response = await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/validate`)
        .set("Cookie", adminCookie)
        .expect(200);

      expect(response.body).toEqual({ studentId, profileStatus: "VALID" });
      const updated = await prisma.studentProfile.findUnique({ where: { id: studentId } });
      expect(updated?.profileStatus).toBe("VALID");
    });

    it("409s when called from an invalid source status (INCOMPLETE)", async () => {
      const { studentId } = await studentWithProfile("INCOMPLETE");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/validate`)
        .set("Cookie", adminCookie)
        .expect(409);
    });

    it("404s for an unknown student id", async () => {
      await request(app.getHttpServer())
        .patch(`/admin/students/${randomUUID()}/profile/validate`)
        .set("Cookie", adminCookie)
        .expect(404);
    });
  });

  describe("PATCH .../reject — ADR-0004: PENDING_VALIDATION/VALID -> INCOMPLETE, with a reason", () => {
    it("200s from PENDING_VALIDATION and flips the profile to INCOMPLETE", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      const response = await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", adminCookie)
        .send({ reason: "Certificat illisible" })
        .expect(200);

      expect(response.body).toEqual({ studentId, profileStatus: "INCOMPLETE" });
    });

    it("200s from VALID and flips the profile to INCOMPLETE", async () => {
      const { studentId } = await studentWithProfile("VALID");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", adminCookie)
        .send({ reason: "Année scolaire expirée" })
        .expect(200);

      const updated = await prisma.studentProfile.findUnique({ where: { id: studentId } });
      expect(updated?.profileStatus).toBe("INCOMPLETE");
    });

    it("409s when called from an invalid source status (INCOMPLETE)", async () => {
      const { studentId } = await studentWithProfile("INCOMPLETE");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", adminCookie)
        .send({ reason: "Certificat illisible" })
        .expect(409);
    });

    it("400s on a missing reason, via the real ZodValidationPipe", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", adminCookie)
        .send({})
        .expect(400);
    });

    it("400s on an empty-string reason", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION");

      await request(app.getHttpServer())
        .patch(`/admin/students/${studentId}/profile/reject`)
        .set("Cookie", adminCookie)
        .send({ reason: "   " })
        .expect(400);
    });
  });
});
