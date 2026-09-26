import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AdminStageRequestListResponse } from "shared";
import { AppModule } from "../src/app.module";
import { MailerService } from "../src/modules/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedAdminAndLogin } from "./helpers/admin";
import { purgeE2eData } from "./helpers/cleanup";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

// Issue #152: PATCH /admin/stage-requests/:id/validate.
describe("Admin validate a stage request (e2e) — issue #152", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailerService: { send: jest.Mock; sendSafely: jest.Mock };
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
  let adminCookie: string;

  beforeAll(async () => {
    // Same mailer boundary swap as the refuse describe block above
    // (ADR-0026): a real network call to Scaleway is never made from e2e.
    mailerService = {
      send: jest.fn().mockResolvedValue(undefined),
      sendSafely: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue(mailerService)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminCookie = await seedAdminAndLogin(app, prisma, createdUserEmails);
  });

  afterAll(async () => {
    await purgeE2eData(prisma, { userEmails: createdUserEmails, organismIds: createdOrganismIds });
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  async function signupStudent(
    lastName = "Dupont",
  ): Promise<{ token: string; profileId: string; email: string }> {
    const email = `e2e.admin-stage-request-validate.student.${randomUUID()}@etu.u-paris.fr`;
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email, password: "a-password-that-is-long-enough", firstName: "Étu", lastName })
      .expect(201);
    const profile = await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { promotion: "L2" },
    });
    return {
      token: requireCookie(cookieMap(response), "access_token"),
      profileId: profile.id,
      email,
    };
  }

  async function seedReferent(lastName: string): Promise<{ id: string; email: string }> {
    const email = `e2e.admin-stage-request-validate.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    const referent = await prisma.referentProfile.create({
      data: {
        user: {
          create: { email, passwordHash: "x", firstName: "Réf", lastName, roles: ["REFERENT"] },
        },
      },
    });
    return { id: referent.id, email };
  }

  async function seedStage(
    studentId: string,
    overrides: {
      status?: "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";
      mandatory?: boolean;
      service?: string | null;
      projectType?: string | null;
      motivation?: string | null;
    } = {},
  ) {
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
    createdOrganismIds.push(organism.id);
    const status = overrides.status ?? "PENDING";
    return prisma.stage.create({
      data: {
        studentId,
        organismId: organism.id,
        tutorId: organism.tutors[0]!.id,
        status,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: overrides.mandatory ?? true,
        service: overrides.service === undefined ? "Service de test" : overrides.service,
        projectType:
          overrides.projectType === undefined ? "Type de handicap de test" : overrides.projectType,
        motivation:
          overrides.motivation === undefined ? "Motivation de test" : overrides.motivation,
        submittedAt: status === "DRAFT" ? null : new Date("2099-01-05T09:00:00.000Z"),
        periods: {
          create: [{ startDate: new Date("2099-10-01"), endDate: new Date("2099-10-31") }],
        },
      },
      include: { organism: true, tutor: true },
    });
  }

  async function assignReferent(
    studentId: string,
    referentId: string,
    overrides: { semester?: "S1" | "S2"; mandatory?: boolean } = {},
  ) {
    await prisma.referentAssignment.create({
      data: {
        studentId,
        schoolYear: "2099-2100",
        semester: overrides.semester ?? "S1",
        mandatory: overrides.mandatory ?? true,
        referentId,
      },
    });
  }

  it("BR-03: refuses to validate without a referent assigned for the stage's exact tuple (409, no write)", async () => {
    const student = await signupStudent();
    const stage = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(409);

    expect(response.body.code).toBe("STAGE_NO_REFERENT");
    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(reloaded.status).toBe("PENDING");
    expect(reloaded.snapshot).toBeNull();
    expect(mailerService.sendSafely).not.toHaveBeenCalled();
  });

  it("BR-03: a referent assigned for the other `mandatory` value does not satisfy the tuple", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("AutreObligatoire");
    await assignReferent(student.profileId, referent.id, { mandatory: false });
    const stage = await seedStage(student.profileId, { mandatory: true });

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(409);

    expect(response.body.code).toBe("STAGE_NO_REFERENT");
  });

  it("only a PENDING stage can be validated", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const draft = await seedStage(student.profileId, { status: "DRAFT" });

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${draft.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(409);

    expect(response.body.code).toBe("STAGE_NOT_PENDING");
  });

  it("BR-09: a stale version is rejected with a conflict, and nothing is overwritten", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 99 })
      .expect(409);

    expect(response.body.code).toBe("STAGE_VERSION_CONFLICT");
    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(reloaded.status).toBe("PENDING");
    expect(reloaded.version).toBe(0);
  });

  it("BR-08/BR-09: freezes a snapshot (non-null referent, promotion at decision time), sets decidedAt, bumps the version, and the request leaves the PENDING list", async () => {
    const student = await signupStudent("Bernard");
    const referent = await seedReferent("Assigné");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId, {
      service: "Cardiologie",
      projectType: "Handicap moteur",
      motivation: "Motivation détaillée du projet.",
    });

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(200);

    expect(response.body).toEqual({
      id: stage.id,
      status: "VALIDATED",
      decidedAt: expect.any(String),
    });

    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(reloaded.status).toBe("VALIDATED");
    expect(reloaded.version).toBe(1);
    expect(reloaded.decidedAt).not.toBeNull();
    expect(reloaded.snapshotVersion).toBe(1);

    // ADR-0033: same snapshot shape as refusal — no student identity duplicated.
    const snapshot = reloaded.snapshot as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      referent: { id: referent.id, firstName: "Réf", lastName: "Assigné" },
      promotion: "L2",
      decidedBy: { id: expect.any(String), firstName: "Admin", lastName: "Test" },
      service: "Cardiologie",
      projectType: "Handicap moteur",
      motivation: "Motivation détaillée du projet.",
    });
    expect(snapshot).not.toHaveProperty("student");
    expect(snapshot).not.toHaveProperty("refusalReason");
    expect(snapshot).not.toHaveProperty("submittedAt");

    // BR-03: it is out of the "Demandes à traiter" list from now on.
    const list = await request(app.getHttpServer())
      .get("/admin/stage-requests")
      .set("Cookie", adminCookie)
      .expect(200);
    expect((list.body as AdminStageRequestListResponse).some((item) => item.id === stage.id)).toBe(
      false,
    );
  });

  it("BR-08: later edits to the organism, tutor or referent never change the frozen snapshot", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Original");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);
    const organismId = stage.organism!.id;

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(200);

    await prisma.hostOrganism.update({ where: { id: organismId }, data: { name: "Nom modifié" } });
    const otherReferent = await seedReferent("Remplaçant");
    await prisma.referentAssignment.updateMany({
      where: {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
      },
      data: { referentId: otherReferent.id },
    });

    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    const snapshot = reloaded.snapshot as { organism: { name: string }; referent: { id: string } };
    expect(snapshot.organism.name).not.toBe("Nom modifié");
    expect(snapshot.referent.id).toBe(referent.id);
  });

  it("BR-07/BR-11: emails the student at their institutional address, cc'ing the personal address (when on file) and the referent visibly, and names the acting admin", async () => {
    const student = await signupStudent("Petit");
    await prisma.studentProfile.update({
      where: { id: student.profileId },
      data: { personalEmail: "perso.petit@example.com" },
    });
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", adminCookie)
      .send({ version: 0 })
      .expect(200);

    // Not toHaveBeenCalledTimes(1): this mailerService mock is shared by
    // every test in this describe block (a fresh app per test would be much
    // slower), so earlier tests' own successful validations also count —
    // only the content of *this* validation's email is this test's concern.
    expect(mailerService.sendSafely).toHaveBeenCalled();
    const input = mailerService.sendSafely.mock.calls.at(-1)![0];
    expect(input.to).toEqual({ email: student.email });
    expect(input.cc).toEqual([{ email: "perso.petit@example.com" }, { email: referent.email }]);
    expect(input.subject).toBe("Votre demande de stage a été validée");
    expect(input.text).toContain("TEST Admin, responsable de stages L2 et L3 APA-S");
  });

  it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .set("Cookie", cookieHeader({ access_token: student.token }))
      .send({ version: 0 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/validate`)
      .send({ version: 0 })
      .expect(401);
  });
});
