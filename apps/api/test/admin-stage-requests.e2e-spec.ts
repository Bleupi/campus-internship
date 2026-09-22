import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AdminStageRequestListResponse } from "shared";
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
        semester: overrides.semester ?? "S1",
        mandatory: overrides.mandatory ?? true,
        service: "Service de test",
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
      include: { organism: true },
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
