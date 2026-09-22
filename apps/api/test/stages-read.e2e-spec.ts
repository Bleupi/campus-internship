import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";
import { purgeE2eData } from "./helpers/cleanup";

// Issue #114: GET /stages and GET /stages/:id.
describe("Stages list + detail (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdOrganismIds: string[] = [];
  const createdReferentEmails: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await purgeE2eData(prisma, {
      userEmails: createdUserEmails,
      organismIds: createdOrganismIds,
    });
    // The student users are gone (their assignments cascaded with them), so
    // the referent users can now be removed without a restricting FK.
    await prisma.user.deleteMany({ where: { email: { in: createdReferentEmails } } });
    await app.close();
  });

  async function signup(): Promise<{ token: string; email: string }> {
    const email = `e2e.stages-read.${randomUUID()}@etu.u-paris.fr`;
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
    return { token: requireCookie(cookieMap(response), "access_token"), email };
  }

  const cookie = (token: string) => cookieHeader({ access_token: token });

  async function seedStage(
    studentEmail: string,
    overrides: Record<string, unknown> = {},
    start = "2099-10-01",
  ) {
    const profile = await prisma.studentProfile.findFirstOrThrow({
      where: { user: { email: studentEmail } },
    });
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
    return prisma.stage.create({
      data: {
        studentId: profile.id,
        organismId: organism.id,
        tutorId: organism.tutors[0]!.id,
        schoolYear: "2099-2100",
        semester: "S1",
        mandatory: true,
        periods: { create: { startDate: new Date(start), endDate: new Date("2099-10-15") } },
        ...overrides,
      },
    });
  }

  it("GET /stages: 401 without a cookie", async () => {
    await request(app.getHttpServer()).get("/stages").expect(401);
  });

  it("GET /stages: returns only the caller's own stages", async () => {
    const me = await signup();
    const other = await signup();
    const mine = await seedStage(me.email);
    await seedStage(other.email);

    const response = await request(app.getHttpServer())
      .get("/stages")
      .set("Cookie", cookie(me.token))
      .expect(200);

    expect(response.body.map((s: { id: string }) => s.id)).toEqual([mine.id]);
  });

  it("GET /stages: filters by status and semester, and 400s on an unknown value", async () => {
    const me = await signup();
    const draft = await seedStage(me.email);
    await seedStage(me.email, { status: "PENDING", semester: "S2", submittedAt: new Date() });

    const byStatus = await request(app.getHttpServer())
      .get("/stages?status=DRAFT")
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(byStatus.body.map((s: { id: string }) => s.id)).toEqual([draft.id]);

    const bySemester = await request(app.getHttpServer())
      .get("/stages?semester=S2")
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(bySemester.body).toHaveLength(1);
    expect(bySemester.body[0].status).toBe("PENDING");

    await request(app.getHttpServer())
      .get("/stages?status=BOGUS")
      .set("Cookie", cookie(me.token))
      .expect(400);
  });

  it("GET /stages: sorts by nearest start date by default, and by submission date on request", async () => {
    const me = await signup();
    const later = await seedStage(me.email, { submittedAt: new Date("2099-01-02") }, "2099-12-01");
    const sooner = await seedStage(me.email, { submittedAt: new Date("2099-01-01") }, "2099-10-01");

    const byStart = await request(app.getHttpServer())
      .get("/stages")
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(byStart.body.map((s: { id: string }) => s.id)).toEqual([sooner.id, later.id]);

    const bySubmission = await request(app.getHttpServer())
      .get("/stages?sort=submittedAt")
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(bySubmission.body.map((s: { id: string }) => s.id)).toEqual([later.id, sooner.id]);
  });

  it("GET /stages/:id: 404 (not 403) for another student's stage, and for an unknown id", async () => {
    const me = await signup();
    const other = await signup();
    const theirs = await seedStage(other.email);

    await request(app.getHttpServer())
      .get(`/stages/${theirs.id}`)
      .set("Cookie", cookie(me.token))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/stages/${randomUUID()}`)
      .set("Cookie", cookie(me.token))
      .expect(404);
  });

  it("GET /stages/:id: a DRAFT comes back with a null referent when none is assigned (BR-03)", async () => {
    const me = await signup();
    const stage = await seedStage(me.email);

    const response = await request(app.getHttpServer())
      .get(`/stages/${stage.id}`)
      .set("Cookie", cookie(me.token))
      .expect(200);

    expect(response.body).toMatchObject({ id: stage.id, status: "DRAFT", referent: null });
    expect(response.body.organism.id).toBe(stage.organismId);
    expect(response.body.periods).toHaveLength(1);
  });

  it("GET /stages/:id: derives the referent from the exact (year, semester, mandatory) tuple (BR-03)", async () => {
    const me = await signup();
    const stage = await seedStage(me.email, { status: "PENDING", submittedAt: new Date() });
    const referentEmail = `e2e.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(referentEmail);
    const referentUser = await prisma.user.create({
      data: {
        email: referentEmail,
        passwordHash: "x",
        firstName: "Jean",
        lastName: "Valjean",
        roles: ["REFERENT"],
        referentProfile: { create: {} },
      },
      include: { referentProfile: true },
    });
    const otherMandatory = {
      studentId: stage.studentId,
      schoolYear: "2099-2100",
      semester: "S1",
    } as const;
    await prisma.referentAssignment.create({
      data: { ...otherMandatory, mandatory: false, referentId: referentUser.referentProfile!.id },
    });

    const beforeMatch = await request(app.getHttpServer())
      .get(`/stages/${stage.id}`)
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(beforeMatch.body.referent).toBeNull();

    await prisma.referentAssignment.create({
      data: { ...otherMandatory, mandatory: true, referentId: referentUser.referentProfile!.id },
    });

    const afterMatch = await request(app.getHttpServer())
      .get(`/stages/${stage.id}`)
      .set("Cookie", cookie(me.token))
      .expect(200);
    expect(afterMatch.body.referent).toEqual({
      id: referentUser.referentProfile!.id,
      firstName: "Jean",
      lastName: "Valjean",
    });
  });
});
