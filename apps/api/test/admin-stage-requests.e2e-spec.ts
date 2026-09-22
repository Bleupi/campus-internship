import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AdminStageRequestDetailResponse, AdminStageRequestListResponse } from "shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedAdminAndLogin } from "./helpers/admin";
import { purgeE2eData } from "./helpers/cleanup";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

// Issue #146: GET /admin/stage-requests, the admin "Demandes à traiter" list.
describe("Admin stage requests list (e2e) — issue #146", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
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
    await purgeE2eData(prisma, { userEmails: createdUserEmails, organismIds: createdOrganismIds });
    // Student users (and their assignments) are gone, so the referent users
    // can be removed without a restricting FK.
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  async function signupStudent(lastName = "Dupont"): Promise<{ token: string; profileId: string }> {
    const email = `e2e.admin-stage-requests.student.${randomUUID()}@etu.u-paris.fr`;
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName,
      })
      .expect(201);
    const profile = await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { promotion: "L2" },
    });
    return { token: requireCookie(cookieMap(response), "access_token"), profileId: profile.id };
  }

  async function seedReferent(lastName: string) {
    const email = `e2e.admin-stage-requests.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        user: {
          create: {
            email,
            passwordHash: "x",
            firstName: "Réf",
            lastName,
            roles: ["REFERENT"],
          },
        },
      },
    });
  }

  async function seedStage(
    studentId: string,
    overrides: {
      status?: "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";
      submittedAt?: Date | null;
      semester?: "S1" | "S2";
      mandatory?: boolean;
      periods?: { startDate: Date; endDate: Date }[];
      service?: string | null;
      projectType?: string | null;
      motivation?: string | null;
      organism?: Partial<{
        street: string;
        postalCode: string;
        city: string;
      }>;
      tutor?: Partial<{
        phone: string | null;
        acceptsPhoneContact: boolean;
      }>;
    } = {},
  ) {
    const organism = await prisma.hostOrganism.create({
      data: {
        name: `Organisme ${randomUUID()}`,
        structureType: "Secteur Sanitaire",
        city: overrides.organism?.city ?? "Paris",
        postalCode: overrides.organism?.postalCode ?? "75014",
        street: overrides.organism?.street ?? "1 rue Test",
        tutors: {
          create: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: overrides.tutor?.phone,
            acceptsPhoneContact: overrides.tutor?.acceptsPhoneContact ?? false,
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
        semester: overrides.semester ?? "S1",
        mandatory: overrides.mandatory ?? true,
        service: overrides.service === undefined ? "Service de test" : overrides.service,
        projectType: overrides.projectType ?? null,
        motivation: overrides.motivation ?? null,
        submittedAt:
          overrides.submittedAt === undefined
            ? status === "DRAFT"
              ? null
              : new Date()
            : overrides.submittedAt,
        periods: {
          create: overrides.periods ?? [
            { startDate: new Date("2099-10-01"), endDate: new Date("2099-10-31") },
          ],
        },
      },
      include: { organism: true, tutor: true },
    });
  }

  async function fetchList(): Promise<AdminStageRequestListResponse> {
    const response = await request(app.getHttpServer())
      .get("/admin/stage-requests")
      .set("Cookie", adminCookie)
      .expect(200);
    return response.body as AdminStageRequestListResponse;
  }

  it("BR-03: lists only PENDING stages, oldest submission first; drafts, validated and refused never appear", async () => {
    const student = await signupStudent();
    const newer = await seedStage(student.profileId, { submittedAt: new Date("2099-01-03") });
    const older = await seedStage(student.profileId, { submittedAt: new Date("2099-01-01") });
    const middle = await seedStage(student.profileId, { submittedAt: new Date("2099-01-02") });
    const draft = await seedStage(student.profileId, { status: "DRAFT" });
    const validated = await seedStage(student.profileId, { status: "VALIDATED" });
    const refused = await seedStage(student.profileId, { status: "REFUSED" });

    const list = await fetchList();
    const ours = new Set([newer, older, middle, draft, validated, refused].map((s) => s.id));
    const ownIds = list.filter((item) => ours.has(item.id)).map((item) => item.id);

    expect(ownIds).toEqual([older.id, middle.id, newer.id]);
  });

  it("BR-04b: each row carries the student, organism, service, first period (and count), the derived semester, kind and submission date", async () => {
    const student = await signupStudent("Martin");
    const stage = await seedStage(student.profileId, {
      semester: "S2",
      mandatory: false,
      submittedAt: new Date("2099-02-01T10:00:00.000Z"),
      periods: [
        { startDate: new Date("2100-03-01"), endDate: new Date("2100-03-15") },
        { startDate: new Date("2100-02-01"), endDate: new Date("2100-02-15") },
      ],
    });

    const row = (await fetchList()).find((item) => item.id === stage.id);

    expect(row).toEqual({
      id: stage.id,
      version: 0,
      schoolYear: "2099-2100",
      semester: "S2",
      mandatory: false,
      service: "Service de test",
      submittedAt: "2099-02-01T10:00:00.000Z",
      student: { id: student.profileId, firstName: "Étu", lastName: "Martin", promotion: "L2" },
      organism: { name: stage.organism!.name, structureType: "Secteur Sanitaire" },
      // The earliest period, not the first one stored.
      firstPeriod: {
        id: expect.any(String),
        startDate: "2100-02-01T00:00:00.000Z",
        endDate: "2100-02-15T00:00:00.000Z",
      },
      periodCount: 2,
      referent: null,
    });
  });

  it("BR-03 / ADR-0014: the referent shown is the one assigned for the exact (year, semester, mandatory) tuple", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    const otherMandatory = await seedReferent("AutreObligatoire");
    const otherSemester = await seedReferent("AutreSemestre");
    // Same student, year and semester but the other `mandatory` value, and the
    // other semester: neither satisfies the mandatory S1 stage below.
    await prisma.referentAssignment.createMany({
      data: [
        {
          studentId: student.profileId,
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: false,
          referentId: otherMandatory.id,
        },
        {
          studentId: student.profileId,
          schoolYear: "2099-2100",
          semester: "S2",
          mandatory: true,
          referentId: otherSemester.id,
        },
      ],
    });
    const stage = await seedStage(student.profileId, { semester: "S1", mandatory: true });

    const withoutReferent = (await fetchList()).find((item) => item.id === stage.id);
    expect(withoutReferent?.referent).toBeNull();

    await prisma.referentAssignment.create({
      data: {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        referentId: referent.id,
      },
    });

    const withReferent = (await fetchList()).find((item) => item.id === stage.id);
    expect(withReferent?.referent).toEqual({
      id: referent.id,
      firstName: "Réf",
      lastName: "Referent",
    });
  });

  it("BR-03: another student's assignment for the same (year, semester, mandatory) tuple is never shown", async () => {
    const withReferent = await signupStudent("AvecReferent");
    const withoutReferent = await signupStudent("SansReferent");
    const referent = await seedReferent("DeLautre");
    await prisma.referentAssignment.create({
      data: {
        studentId: withReferent.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        referentId: referent.id,
      },
    });
    const covered = await seedStage(withReferent.profileId);
    const uncovered = await seedStage(withoutReferent.profileId);

    const list = await fetchList();

    expect(list.find((item) => item.id === covered.id)?.referent?.id).toBe(referent.id);
    expect(list.find((item) => item.id === uncovered.id)?.referent).toBeNull();
  });

  it("ADR-0014: reassigning a referent in place changes the referent shown on live stages", async () => {
    const student = await signupStudent();
    const before = await seedReferent("Avant");
    const after = await seedReferent("Apres");
    const assignment = await prisma.referentAssignment.create({
      data: {
        studentId: student.profileId,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        referentId: before.id,
      },
    });
    const stage = await seedStage(student.profileId);
    expect((await fetchList()).find((item) => item.id === stage.id)?.referent?.id).toBe(before.id);

    await prisma.referentAssignment.update({
      where: { id: assignment.id },
      data: { referentId: after.id },
    });

    expect((await fetchList()).find((item) => item.id === stage.id)?.referent?.id).toBe(after.id);
    expect(await prisma.referentAssignment.count({ where: { studentId: student.profileId } })).toBe(
      1,
    );
  });

  it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
    const student = await signupStudent();

    await request(app.getHttpServer())
      .get("/admin/stage-requests")
      .set("Cookie", cookieHeader({ access_token: student.token }))
      .expect(403);
    await request(app.getHttpServer()).get("/admin/stage-requests").expect(401);
  });
});

// Issue #147: GET /admin/stage-requests/:id, the "Demandes à traiter" row-expand
// detail — everything the student provided for one PENDING request.
describe("Admin stage request detail (e2e) — issue #147", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
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
    await purgeE2eData(prisma, { userEmails: createdUserEmails, organismIds: createdOrganismIds });
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  async function signupStudent(lastName = "Dupont"): Promise<{ token: string; profileId: string }> {
    const email = `e2e.admin-stage-request-detail.student.${randomUUID()}@etu.u-paris.fr`;
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "a-password-that-is-long-enough",
        firstName: "Étu",
        lastName,
      })
      .expect(201);
    const profile = await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { promotion: "L2" },
    });
    return { token: requireCookie(cookieMap(response), "access_token"), profileId: profile.id };
  }

  async function seedReferent(lastName: string) {
    const email = `e2e.admin-stage-request-detail.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        user: {
          create: {
            email,
            passwordHash: "x",
            firstName: "Réf",
            lastName,
            roles: ["REFERENT"],
          },
        },
      },
    });
  }

  async function seedStage(
    studentId: string,
    overrides: {
      status?: "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";
      service?: string | null;
      projectType?: string | null;
      motivation?: string | null;
      periods?: { startDate: Date; endDate: Date }[];
      organism?: Partial<{ street: string; postalCode: string; city: string }>;
      tutor?: Partial<{ phone: string | null; acceptsPhoneContact: boolean }>;
    } = {},
  ) {
    const organism = await prisma.hostOrganism.create({
      data: {
        name: `Organisme ${randomUUID()}`,
        structureType: "Secteur Sanitaire",
        city: overrides.organism?.city ?? "Paris",
        postalCode: overrides.organism?.postalCode ?? "75014",
        street: overrides.organism?.street ?? "1 rue Test",
        tutors: {
          create: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: overrides.tutor?.phone,
            acceptsPhoneContact: overrides.tutor?.acceptsPhoneContact ?? false,
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
        mandatory: true,
        service: overrides.service === undefined ? "Service de test" : overrides.service,
        projectType: overrides.projectType ?? null,
        motivation: overrides.motivation ?? null,
        submittedAt: status === "DRAFT" ? null : new Date("2099-01-05T09:00:00.000Z"),
        periods: {
          create: overrides.periods ?? [
            { startDate: new Date("2099-10-01"), endDate: new Date("2099-10-31") },
          ],
        },
      },
      include: { organism: true, tutor: true },
    });
  }

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
      student: { id: student.profileId, firstName: "Étu", lastName: "Bernard", promotion: "L2" },
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
    });
  });

  it("returns null for values the student never filled in (project type, motivation, tutor phone, referent)", async () => {
    const student = await signupStudent("Sansreferent");
    const stage = await seedStage(student.profileId, {
      projectType: null,
      motivation: null,
      tutor: { phone: null },
    });

    const response = await request(app.getHttpServer())
      .get(`/admin/stage-requests/${stage.id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    const body = response.body as AdminStageRequestDetailResponse;
    expect(body.projectType).toBeNull();
    expect(body.motivation).toBeNull();
    expect(body.tutor.phone).toBeNull();
    expect(body.referent).toBeNull();
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
});
