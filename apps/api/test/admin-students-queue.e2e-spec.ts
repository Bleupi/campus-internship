import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap } from "./helpers/cookies";

function uniqueEmail(prefix: string): string {
  return `e2e.admin-students-queue.${prefix}.${randomUUID()}@u-paris.fr`;
}

describe("Admin certificate-validation queue (e2e) — issue #42", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  let adminCookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

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

  // Signs a STUDENT up, then forces their profile straight into the given
  // status (and, when a certificate is provided, attaches a FileObject) via
  // direct DB writes — the INCOMPLETE -> PENDING_VALIDATION transition
  // itself is already covered by students.e2e-spec.ts.
  async function studentWithProfile(
    profileStatus: "INCOMPLETE" | "PENDING_VALIDATION" | "VALID",
    options: {
      firstName?: string;
      lastName?: string;
      certificate?: { uploadedAt: Date; expiresAt: Date | null; mimeType?: string };
    } = {},
  ): Promise<{ studentId: string }> {
    const email = uniqueEmail("student");
    createdUserEmails.push(email);
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: options.firstName ?? "Étu",
        lastName: options.lastName ?? "Dupont",
      })
      .expect(201);

    const created = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email } } });
    const profile = await prisma.studentProfile.update({
      where: { id: created.id },
      data: { profileStatus, profileYear: "2025-2026", promotion: "L2" },
    });

    if (options.certificate) {
      await prisma.fileObject.create({
        data: {
          type: "INSURANCE_CERTIFICATE",
          bucketKey: `students/${profile.id}/INSURANCE_CERTIFICATE/${randomUUID()}`,
          mimeType: options.certificate.mimeType ?? "application/pdf",
          sizeBytes: 1024,
          uploadedAt: options.certificate.uploadedAt,
          expiresAt: options.certificate.expiresAt,
          studentProfileId: profile.id,
        },
      });
    }

    return { studentId: profile.id };
  }

  describe("RBAC", () => {
    it("403s for a non-ADMIN caller", async () => {
      const email = uniqueEmail("rbac");
      createdUserEmails.push(email);
      const signup = await request(app.getHttpServer())
        .post("/auth/signup")
        .send({
          email,
          password: "a-password-that-is-long-enough",
          firstName: "Étu",
          lastName: "Dupont",
        })
        .expect(201);
      const accessToken = cookieMap(signup).access_token ?? "";

      await request(app.getHttpServer())
        .get("/admin/students/certificate-queue")
        .set("Cookie", cookieHeader({ access_token: accessToken }))
        .expect(403);
    });

    it("401s with no cookie at all", async () => {
      await request(app.getHttpServer()).get("/admin/students/certificate-queue").expect(401);
    });
  });

  describe("GET /admin/students/certificate-queue", () => {
    it("returns only PENDING_VALIDATION profiles, oldest-updatedAt-first, with certificate metadata", async () => {
      const older = await studentWithProfile("PENDING_VALIDATION", {
        firstName: "Alice",
        lastName: "Martin",
        certificate: {
          uploadedAt: new Date("2026-07-01T00:00:00.000Z"),
          expiresAt: new Date("2027-09-01T00:00:00.000Z"),
          mimeType: "application/pdf",
        },
      });
      // Backdate `updatedAt` directly — Prisma's @updatedAt would otherwise
      // stamp "now" on every write in this test, making FIFO unverifiable.
      await prisma.studentProfile.update({
        where: { id: older.studentId },
        data: { updatedAt: new Date("2026-08-01T00:00:00.000Z") },
      });

      const newer = await studentWithProfile("PENDING_VALIDATION", {
        firstName: "Bob",
        lastName: "Durand",
      });
      await prisma.studentProfile.update({
        where: { id: newer.studentId },
        data: { updatedAt: new Date("2026-08-02T00:00:00.000Z") },
      });

      const { studentId: excludedId } = await studentWithProfile("VALID", {
        firstName: "Carla",
        lastName: "Nguyen",
      });

      const response = await request(app.getHttpServer())
        .get("/admin/students/certificate-queue")
        .set("Cookie", adminCookie)
        .expect(200);

      const ids = (response.body as Array<{ studentId: string }>).map((entry) => entry.studentId);
      expect(ids).not.toContain(excludedId);
      expect(ids.indexOf(older.studentId)).toBeLessThan(ids.indexOf(newer.studentId));

      const olderEntry = (
        response.body as Array<{
          studentId: string;
          firstName: string;
          lastName: string;
          promotion: string;
          certificate: { uploadedAt: string; mimeType: string } | null;
        }>
      ).find((entry) => entry.studentId === older.studentId);
      expect(olderEntry).toMatchObject({
        firstName: "Alice",
        lastName: "Martin",
        promotion: "L2",
        certificate: { uploadedAt: "2026-07-01T00:00:00.000Z", mimeType: "application/pdf" },
      });
    });

    it("reports certificate: null when the profile's only certificate has already expired", async () => {
      const { studentId } = await studentWithProfile("PENDING_VALIDATION", {
        certificate: {
          uploadedAt: new Date("2025-06-01T00:00:00.000Z"),
          expiresAt: new Date("2025-09-01T00:00:00.000Z"),
        },
      });

      const response = await request(app.getHttpServer())
        .get("/admin/students/certificate-queue")
        .set("Cookie", adminCookie)
        .expect(200);

      const entry = (response.body as Array<{ studentId: string; certificate: unknown }>).find(
        (item) => item.studentId === studentId,
      );
      expect(entry?.certificate).toBeNull();
    });
  });
});
