import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AdminStageRequestDetailResponse, AdminStageRequestListResponse } from "shared";
import { AppModule } from "../src/app.module";
import { MailerService } from "../src/modules/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedAdminAndLogin } from "./helpers/admin";
import { purgeE2eData } from "./helpers/cleanup";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";
import { snapshotV1 } from "./helpers/stage-snapshot";

type StageOverrides = {
  status?: "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";
  submittedAt?: Date | null;
  semester?: "S1" | "S2";
  mandatory?: boolean;
  periods?: { startDate: Date; endDate: Date }[];
  service?: string | null;
  projectType?: string | null;
  motivation?: string | null;
  organism?: Partial<{ street: string; postalCode: string; city: string }>;
  tutor?: Partial<{ phone: string | null; acceptsPhoneContact: boolean }>;
};

// Shared by both describe blocks below (each runs its own app/DB-tracking
// instance, so this is a factory rather than file-scope state) — kept as one
// implementation so a BR-02/BR-03 fixture-shape change only needs one edit.
function createStageRequestHelpers(
  app: INestApplication,
  prisma: PrismaService,
  emailPrefix: string,
  createdUserEmails: string[],
  createdReferentEmails: string[],
  createdOrganismIds: string[],
) {
  async function signupStudent(
    lastName = "Dupont",
  ): Promise<{ token: string; profileId: string; email: string }> {
    const email = `e2e.${emailPrefix}.student.${randomUUID()}@etu.u-paris.fr`;
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

  async function seedReferent(lastName: string) {
    const email = `e2e.${emailPrefix}.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        user: {
          create: { email, passwordHash: "x", firstName: "Réf", lastName, roles: ["REFERENT"] },
        },
      },
    });
  }

  async function seedStage(studentId: string, overrides: StageOverrides = {}) {
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
        // BR-02: submission requires these non-blank, so a real PENDING stage
        // never has them null — only explicit overrides may still force null
        // (e.g. for a DRAFT fixture).
        projectType:
          overrides.projectType === undefined ? "Type de handicap de test" : overrides.projectType,
        motivation:
          overrides.motivation === undefined ? "Motivation de test" : overrides.motivation,
        submittedAt:
          overrides.submittedAt === undefined
            ? status === "DRAFT"
              ? null
              : new Date("2099-01-05T09:00:00.000Z")
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

  // Issue #154: a previously VALIDATED mandatory stage, seeded directly with
  // a frozen snapshot rather than through the real validate flow (same
  // shortcut as helpers/stage-snapshot.ts was built for) — findById() only
  // ever reads these from the snapshot, never the live row.
  async function seedValidatedMandatoryStage(
    studentId: string,
    overrides: {
      schoolYear?: string;
      semester?: "S1" | "S2";
      decidedAt?: Date;
      organismName?: string;
      structureType?: string;
      service?: string;
      promotion?: string;
    } = {},
  ) {
    const pending = await seedStage(studentId, { mandatory: true });
    const organismName = overrides.organismName ?? pending.organism!.name;
    return prisma.stage.update({
      where: { id: pending.id },
      data: {
        status: "VALIDATED",
        snapshotVersion: 1,
        decidedAt: overrides.decidedAt ?? new Date("2099-06-01T00:00:00.000Z"),
        snapshot: snapshotV1({
          schoolYear: overrides.schoolYear ?? "2099-2100",
          semester: overrides.semester ?? "S1",
          mandatory: true,
          service: overrides.service ?? "Service de test",
          organism: {
            id: pending.organismId,
            name: organismName,
            structureType: overrides.structureType ?? "Secteur Sanitaire",
            city: "Paris",
            postalCode: "75014",
            street: "1 rue Test",
          },
          promotion: overrides.promotion ?? "L2",
        }),
      },
    });
  }

  return { signupStudent, seedReferent, seedStage, seedValidatedMandatoryStage };
}

// Issue #146: GET /admin/stage-requests, the admin "Demandes à traiter" list.
describe("Admin stage requests list (e2e) — issue #146", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
  let adminCookie: string;
  let signupStudent: ReturnType<typeof createStageRequestHelpers>["signupStudent"];
  let seedReferent: ReturnType<typeof createStageRequestHelpers>["seedReferent"];
  let seedStage: ReturnType<typeof createStageRequestHelpers>["seedStage"];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminCookie = await seedAdminAndLogin(app, prisma, createdUserEmails);
    ({ signupStudent, seedReferent, seedStage } = createStageRequestHelpers(
      app,
      prisma,
      "admin-stage-requests",
      createdUserEmails,
      createdReferentEmails,
      createdOrganismIds,
    ));
  });

  afterAll(async () => {
    await purgeE2eData(prisma, { userEmails: createdUserEmails, organismIds: createdOrganismIds });
    // Student users (and their assignments) are gone, so the referent users
    // can be removed without a restricting FK.
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

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
      otherLiveStageCount: 0,
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

  it("issue #149 / ADR-0014: counts the other live (DRAFT/PENDING) stages of the same student sharing the exact tuple, never decided ones nor the request itself", async () => {
    const student = await signupStudent();
    const other = await signupStudent();
    const listed = await seedStage(student.profileId);
    const pendingSibling = await seedStage(student.profileId);
    await seedStage(student.profileId, { status: "DRAFT" });
    await seedStage(student.profileId, { status: "VALIDATED" });
    await seedStage(student.profileId, { status: "REFUSED" });
    // Same student, other tuple: other `mandatory` value, other semester.
    const optional = await seedStage(student.profileId, { mandatory: false });
    await seedStage(student.profileId, {
      semester: "S2",
      periods: [{ startDate: new Date("2100-02-01"), endDate: new Date("2100-02-28") }],
    });
    // Same tuple, other student.
    await seedStage(other.profileId);

    const list = await fetchList();
    const countOf = (id: string) => list.find((item) => item.id === id)?.otherLiveStageCount;

    expect(countOf(listed.id)).toBe(2);
    expect(countOf(pendingSibling.id)).toBe(2);
    expect(countOf(optional.id)).toBe(0);
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

// Issue #151: PATCH /admin/stage-requests/:id/refuse.
describe("Admin refuse a stage request (e2e) — issue #151", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailerService: { send: jest.Mock; sendSafely: jest.Mock };
  const createdUserEmails: string[] = [];
  const createdReferentEmails: string[] = [];
  const createdOrganismIds: string[] = [];
  let adminCookie: string;

  beforeAll(async () => {
    // Same mailer boundary swap as admin-students.e2e-spec.ts (ADR-0026): a
    // real network call to Scaleway is never made from e2e.
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
    const email = `e2e.admin-stage-request-refuse.student.${randomUUID()}@etu.u-paris.fr`;
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

  async function seedReferent(lastName: string) {
    const email = `e2e.admin-stage-request-refuse.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        user: {
          create: { email, passwordHash: "x", firstName: "Réf", lastName, roles: ["REFERENT"] },
        },
      },
    });
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

  it("BR-03: refuses without a referent assigned for the stage's exact tuple (409, no write)", async () => {
    const student = await signupStudent();
    const stage = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "Motif" })
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
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "Motif" })
      .expect(409);

    expect(response.body.code).toBe("STAGE_NO_REFERENT");
  });

  it("only a PENDING stage can be refused", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const draft = await seedStage(student.profileId, { status: "DRAFT" });

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${draft.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "Motif" })
      .expect(409);

    expect(response.body.code).toBe("STAGE_NOT_PENDING");
  });

  it("BR-09: a stale version is rejected with a conflict, and nothing is overwritten", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    const response = await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 99, reason: "Motif" })
      .expect(409);

    expect(response.body.code).toBe("STAGE_VERSION_CONFLICT");
    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(reloaded.status).toBe("PENDING");
    expect(reloaded.version).toBe(0);
  });

  it("requires a non-empty reason (400)", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "   " })
      .expect(400);
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
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "L'adresse de l'organisme est incomplète." })
      .expect(200);

    expect(response.body).toEqual({
      id: stage.id,
      status: "REFUSED",
      decidedAt: expect.any(String),
    });

    const reloaded = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(reloaded.status).toBe("REFUSED");
    expect(reloaded.version).toBe(1);
    expect(reloaded.decidedAt).not.toBeNull();
    expect(reloaded.refusalReason).toBe("L'adresse de l'organisme est incomplète.");
    expect(reloaded.snapshotVersion).toBe(1);

    // ADR-0033: the snapshot never duplicates the student identity, the
    // refusal reason or submittedAt — those stay live Stage columns.
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
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "Motif" })
      .expect(200);

    await prisma.hostOrganism.update({ where: { id: organismId }, data: { name: "Nom modifié" } });
    const otherReferent = await seedReferent("Remplaçant");
    // ADR-0014: an in-place UPDATE (assignReferent above only ever creates
    // the first assignment for a tuple).
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

  it("BR-07/BR-11: emails the student at their institutional address (cc personal when on file), names the acting admin, and includes the reason", async () => {
    const student = await signupStudent("Petit");
    await prisma.studentProfile.update({
      where: { id: student.profileId },
      data: { personalEmail: "perso.petit@example.com" },
    });
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", adminCookie)
      .send({ version: 0, reason: "Adresse incomplète" })
      .expect(200);

    // Not toHaveBeenCalledTimes(1): this mailerService mock is shared by
    // every test in this describe block (a fresh app per test would be much
    // slower), so earlier tests' own successful refusals also count — only
    // the content of *this* refusal's email is this test's concern.
    expect(mailerService.sendSafely).toHaveBeenCalled();
    const input = mailerService.sendSafely.mock.calls.at(-1)![0];
    expect(input.to).toEqual({ email: student.email });
    expect(input.cc).toEqual({ email: "perso.petit@example.com" });
    expect(input.subject).toBe("Votre demande de stage a été refusée");
    expect(input.text).toContain("TEST Admin, responsable de stages L2 et L3 APA-S");
    expect(input.text).toContain("Adresse incomplète");
  });

  it("RBAC: a non-admin is rejected (403) and an anonymous caller is unauthorized (401)", async () => {
    const student = await signupStudent();
    const referent = await seedReferent("Referent");
    await assignReferent(student.profileId, referent.id);
    const stage = await seedStage(student.profileId);

    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .set("Cookie", cookieHeader({ access_token: student.token }))
      .send({ version: 0, reason: "Motif" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/stage-requests/${stage.id}/refuse`)
      .send({ version: 0, reason: "Motif" })
      .expect(401);
  });
});

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
