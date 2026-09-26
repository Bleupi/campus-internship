import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AdminStageRequestDetailResponse } from "shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedAdminAndLogin } from "./helpers/admin";
import { purgeE2eData } from "./helpers/cleanup";
import { cookieHeader } from "./helpers/cookies";
import { createStageRequestHelpers } from "./helpers/admin-stage-requests";

// Issue #147: GET /admin/stage-requests/:id, the "Demandes à traiter" row-expand
// detail — everything the student provided for one PENDING request.
describe("Admin stage request detail (e2e) — issue #147", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
  let adminCookie: string;
  let signupStudent: ReturnType<typeof createStageRequestHelpers>["signupStudent"];
  let seedReferent: ReturnType<typeof createStageRequestHelpers>["seedReferent"];
  let seedStage: ReturnType<typeof createStageRequestHelpers>["seedStage"];
  let seedValidatedMandatoryStage: ReturnType<
    typeof createStageRequestHelpers
  >["seedValidatedMandatoryStage"];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminCookie = await seedAdminAndLogin(app, prisma, createdUserEmails);
    ({ signupStudent, seedReferent, seedStage, seedValidatedMandatoryStage } =
      createStageRequestHelpers(
        app,
        prisma,
        "admin-stage-request-detail",
        createdUserEmails,
        createdReferentEmails,
        createdOrganismIds,
      ));
  });

  afterAll(async () => {
    await purgeE2eData(prisma, { userEmails: createdUserEmails, organismIds: createdOrganismIds });
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  it("BR-03: returns everything the student provided for a PENDING request (organism, tutor, service, project, motivation, periods, referent)", async () => {
    const student = await signupStudent("Bernard");
    const referent = await seedReferent("Assigné");
    await prisma.referentAssignment.create({
      data: {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        referentId: referent.id,
      },
    });
    const stage = await seedStage(student.profileId, {
      service: "Cardiologie",
      projectType: "Handicap moteur",
      motivation: "Motivation détaillée du projet.",
      organism: { street: "12 rue de la Santé", postalCode: "75013", city: "Paris" },
      tutor: { phone: "0102030405", acceptsPhoneContact: true },
      periods: [
        { startDate: new Date("2099-10-01"), endDate: new Date("2099-10-05") },
        { startDate: new Date("2099-11-01"), endDate: new Date("2099-11-01") },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${stage.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    const body = response.body as AdminStageRequestDetailResponse;
    expect(body).toEqual({
      id: stage.id,
      version: 0,
      schoolYear: "2099-2100",
      semester: "S1",
      mandatory: true,
      service: "Cardiologie",
      projectType: "Handicap moteur",
      motivation: "Motivation détaillée du projet.",
      submittedAt: "2099-01-05T09:00:00.000Z",
      student: {
        id: student.profileId,
        firstName: "Étu",
        lastName: "Bernard",
        email: student.email,
        promotion: "L2",
      },
      organism: {
        name: stage.organism!.name,
        structureType: "Secteur Sanitaire",
        street: "12 rue de la Santé",
        postalCode: "75013",
        city: "Paris",
      },
      tutor: {
        firstName: "Marie",
        lastName: "Curie",
        email: "m.curie@example.org",
        jobTitle: "Médecin",
        phone: "0102030405",
        acceptsPhoneContact: true,
      },
      periods: [
        {
          id: expect.any(String),
          startDate: "2099-10-01T00:00:00.000Z",
          endDate: "2099-10-05T00:00:00.000Z",
        },
        {
          id: expect.any(String),
          startDate: "2099-11-01T00:00:00.000Z",
          endDate: "2099-11-01T00:00:00.000Z",
        },
      ],
      referent: { id: referent.id, firstName: "Réf", lastName: "Assigné" },
      previousMandatoryStages: [],
    });
  });

  // BR-02 requires project type and motivation to be non-blank to submit, so
  // a real PENDING stage never has them null — only tutor phone (optional on
  // Tutor) and the referent (assigned separately, may not exist yet) can
  // legitimately be missing here.
  it("returns null only for values a student may legitimately omit (tutor phone, referent)", async () => {
    const student = await signupStudent("Sansreferent");
    const stage = await seedStage(student.profileId, { tutor: { phone: null } });

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${stage.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    const body = response.body as AdminStageRequestDetailResponse;
    expect(body.tutor.phone).toBeNull();
    expect(body.referent).toBeNull();
    expect(body.projectType).toBe("Type de handicap de test");
    expect(body.motivation).toBe("Motivation de test");
  });

  it("BR-03: a referent assigned for the other `mandatory` value is never shown as this stage's referent", async () => {
    const student = await signupStudent();
    const otherMandatoryReferent = await seedReferent("AutreObligatoire");
    await prisma.referentAssignment.create({
      data: {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: false,
        referentId: otherMandatoryReferent.id,
      },
    });
    const stage = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${stage.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect((response.body as AdminStageRequestDetailResponse).referent).toBeNull();
  });

  it("404s for a non-existent id, and for a DRAFT, VALIDATED or REFUSED stage (only PENDING is a valid target here)", async () => {
    const student = await signupStudent();
    const draft = await seedStage(student.profileId, { status: "DRAFT" });
    const validated = await seedStage(student.profileId, { status: "VALIDATED" });
    const refused = await seedStage(student.profileId, { status: "REFUSED" });

    await request(app.getHttpServer())
      .get(`/admin/stage-requests/${randomUUID()}`)
      .set("Cookie", adminCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/admin/stage-requests/${draft.id}`)
      .set("Cookie", adminCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/admin/stage-requests/${validated.id}`)
      .set("Cookie", adminCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/admin/stage-requests/${refused.id}`)
      .set("Cookie", adminCookie)
      .expect(404);
  });

  it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
    const student = await signupStudent();
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .get(`/admin/stage-requests/${stage.id}`)
      .set("Cookie", cookieHeader({ access_token: student.token }))
      .expect(403);
    await request(app.getHttpServer()).get(`/admin/stage-requests/${stage.id}`).expect(401);
  });

  it("issue #154: lists only the student's VALIDATED mandatory stages, most recent decision first, excluding optional/refused/pending/draft and other students' stages", async () => {
    const student = await signupStudent("Historique");
    const otherStudent = await signupStudent("Autre");
    const current = await seedStage(student.profileId);

    await seedValidatedMandatoryStage(student.profileId, {
      schoolYear: "2097-2098",
      decidedAt: new Date("2097-06-01T00:00:00.000Z"),
      organismName: "Ancien Hôpital",
      service: "Ancien service",
      promotion: "L2",
    });
    await seedValidatedMandatoryStage(student.profileId, {
      schoolYear: "2098-2099",
      decidedAt: new Date("2098-06-01T00:00:00.000Z"),
      organismName: "Hôpital récent",
      service: "Service récent",
      promotion: "L3",
    });
    // None of these should ever appear.
    await seedValidatedMandatoryStage(otherStudent.profileId);
    await seedStage(student.profileId, { mandatory: false, status: "VALIDATED" });
    await seedStage(student.profileId, { mandatory: true, status: "REFUSED" });
    await seedStage(student.profileId, { mandatory: true, status: "PENDING" });
    await seedStage(student.profileId, { mandatory: true, status: "DRAFT" });

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${current.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    const body = response.body as AdminStageRequestDetailResponse;
    expect(body.previousMandatoryStages).toEqual([
      {
        schoolYear: "2098-2099",
        semester: "S1",
        promotion: "L3",
        organism: { name: "Hôpital récent", structureType: "Secteur Sanitaire" },
        service: "Service récent",
      },
      {
        schoolYear: "2097-2098",
        semester: "S1",
        promotion: "L2",
        organism: { name: "Ancien Hôpital", structureType: "Secteur Sanitaire" },
        service: "Ancien service",
      },
    ]);
  });

  it("issue #154: returns an empty array when the student has no previous validated mandatory stage", async () => {
    const student = await signupStudent("Sanshistorique");
    const current = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${current.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect((response.body as AdminStageRequestDetailResponse).previousMandatoryStages).toEqual([]);
  });

  it("BR-08 (issue #154): previous stages are read from the frozen snapshot, unaffected by later edits to the organism or the student's promotion", async () => {
    const student = await signupStudent("Snapshot");
    const current = await seedStage(student.profileId);
    const validated = await seedValidatedMandatoryStage(student.profileId, {
      organismName: "Nom au moment de la décision",
      promotion: "L2",
    });

    // Edit what's live after the fact.
    const liveSnapshot = validated.snapshot as { organism: { id: string } };
    await prisma.hostOrganism.update({
      where: { id: liveSnapshot.organism.id },
      data: { name: "Nom modifié depuis" },
    });
    await prisma.studentProfile.update({
      where: { id: student.profileId },
      data: { promotion: "L3" },
    });

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${current.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    const [previous] = (response.body as AdminStageRequestDetailResponse).previousMandatoryStages;
    expect(previous?.organism.name).toBe("Nom au moment de la décision");
    expect(previous?.promotion).toBe("L2");
  });
});
