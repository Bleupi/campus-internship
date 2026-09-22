import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { ReferentListResponse } from "shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedAdminAndLogin } from "./helpers/admin";
import { purgeE2eData } from "./helpers/cleanup";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

// Issue #148: GET /referents (the picker's option list) and
// PATCH /referents/assignments (the single-assignment upsert, ADR-0014).
describe("Referents (e2e) — issue #148", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  let adminCookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminCookie = await seedAdminAndLogin(app, prisma, createdUserEmails);
  });

  afterAll(async () => {
    await purgeE2eData(prisma, { userEmails: createdUserEmails });
    // Student users (and their assignments) are gone, so the referent users
    // can be removed without a restricting FK — same ordering as the
    // admin-stage-requests e2e spec.
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  async function signupStudent(lastName = "Dupont"): Promise<{ token: string; profileId: string }> {
    const email = `e2e.referents.student.${randomUUID()}@etu.u-paris.fr`;
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email, password: "a-password-that-is-long-enough", firstName: "Étu", lastName })
      .expect(201);
    const profile = await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { promotion: "L2" },
    });
    return { token: requireCookie(cookieMap(response), "access_token"), profileId: profile.id };
  }

  async function seedReferent(lastName: string, archived = false) {
    const email = `e2e.referents.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        archived,
        user: {
          create: { email, passwordHash: "x", firstName: "Réf", lastName, roles: ["REFERENT"] },
        },
      },
    });
  }

  describe("GET /referents", () => {
    it("lists non-archived referents sorted by last name, excluding archived ones", async () => {
      const zed = await seedReferent("Zed");
      const archived = await seedReferent("Alpha", true);
      const alpha = await seedReferent("Beta");

      const response = await request(app.getHttpServer())
        .get("/referents")
        .set("Cookie", adminCookie)
        .expect(200);

      const body = response.body as ReferentListResponse;
      const ours = body.filter((r) => [zed.id, archived.id, alpha.id].includes(r.id));
      expect(ours.map((r) => r.id)).toEqual([alpha.id, zed.id]);
      expect(ours.some((r) => r.id === archived.id)).toBe(false);
    });

    it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
      const student = await signupStudent();

      await request(app.getHttpServer())
        .get("/referents")
        .set("Cookie", cookieHeader({ access_token: student.token }))
        .expect(403);
      await request(app.getHttpServer()).get("/referents").expect(401);
    });
  });

  describe("PATCH /referents/assignments", () => {
    it("ADR-0014: creates the assignment when none exists yet for the exact tuple", async () => {
      const student = await signupStudent();
      const referent = await seedReferent("Nouveau");

      const response = await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", adminCookie)
        .send({
          studentId: student.profileId,
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: true,
          referentId: referent.id,
        })
        .expect(200);

      expect(response.body).toEqual({ id: referent.id, firstName: "Réf", lastName: "Nouveau" });
      expect(
        await prisma.referentAssignment.count({ where: { studentId: student.profileId } }),
      ).toBe(1);
    });

    it("ADR-0014: reassigning updates the existing row in place — no unique-constraint conflict, no duplicate row", async () => {
      const student = await signupStudent();
      const before = await seedReferent("Avant");
      const after = await seedReferent("Apres");
      const tuple = {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1" as const,
        mandatory: true,
      };
      const assignment = await prisma.referentAssignment.create({
        data: { ...tuple, referentId: before.id },
      });

      await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", adminCookie)
        .send({ ...tuple, referentId: after.id })
        .expect(200);

      const rows = await prisma.referentAssignment.findMany({
        where: { studentId: student.profileId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(assignment.id);
      expect(rows[0]!.referentId).toBe(after.id);
    });

    it("BR-03: a referent assigned for the other `mandatory` value does not satisfy this tuple — a distinct row is created", async () => {
      const student = await signupStudent();
      const forMandatory = await seedReferent("Obligatoire");
      const forOptional = await seedReferent("Facultatif");
      await prisma.referentAssignment.create({
        data: {
          studentId: student.profileId,
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: true,
          referentId: forMandatory.id,
        },
      });

      await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", adminCookie)
        .send({
          studentId: student.profileId,
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: false,
          referentId: forOptional.id,
        })
        .expect(200);

      const rows = await prisma.referentAssignment.findMany({
        where: { studentId: student.profileId },
        orderBy: { mandatory: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.mandatory === true)?.referentId).toBe(forMandatory.id);
      expect(rows.find((r) => r.mandatory === false)?.referentId).toBe(forOptional.id);
    });

    it("does not bump Stage.version and never touches an already-decided stage's referent-facing fields", async () => {
      const student = await signupStudent();
      const before = await seedReferent("Gele");
      const after = await seedReferent("ApresGel");
      const tuple = {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1" as const,
        mandatory: true,
      };
      await prisma.referentAssignment.create({ data: { ...tuple, referentId: before.id } });
      const organism = await prisma.hostOrganism.create({
        data: {
          name: `Organisme ${randomUUID()}`,
          structureType: "Secteur Sanitaire",
          city: "Paris",
          postalCode: "75014",
          street: "1 rue Test",
          tutors: {
            create: {
              firstName: "Marie",
              lastName: "Curie",
              email: "m.curie@example.org",
              jobTitle: "Médecin",
              acceptsPhoneContact: false,
            },
          },
        },
        include: { tutors: true },
      });
      const validated = await prisma.stage.create({
        data: {
          organismId: organism.id,
          tutorId: organism.tutors[0]!.id,
          status: "VALIDATED",
          ...tuple,
          service: "Service",
          projectType: "Type",
          motivation: "Motivation",
          submittedAt: new Date(),
        },
      });

      await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", adminCookie)
        .send({ ...tuple, referentId: after.id })
        .expect(200);

      const reread = await prisma.stage.findUniqueOrThrow({ where: { id: validated.id } });
      expect(reread.version).toBe(validated.version);
      expect(reread.status).toBe("VALIDATED");
      // Cleanup: purgeE2eData (afterAll) discovers this organism through the
      // student's stages, so no manual teardown is needed here.
    });

    it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
      const student = await signupStudent();
      const referent = await seedReferent("Rbac");
      const body = {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        referentId: referent.id,
      };

      await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", cookieHeader({ access_token: student.token }))
        .send(body)
        .expect(403);
      await request(app.getHttpServer()).patch("/referents/assignments").send(body).expect(401);
    });

    it("rejects an invalid body (missing fields) with 400", async () => {
      await request(app.getHttpServer())
        .patch("/referents/assignments")
        .set("Cookie", adminCookie)
        .send({ studentId: "not-a-uuid" })
        .expect(400);
    });
  });
});
