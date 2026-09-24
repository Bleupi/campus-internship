import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";
import { snapshotV1 } from "./helpers/stage-snapshot";
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
    // A real PENDING stage's student always has promotion set (BR-02: it's a
    // precondition for the VALID profile submission requires) — keeps this
    // fixture consistent with that invariant so a row created here can never
    // trip admin-stage-requests.service.ts's checks in a concurrently
    // running e2e file (they share one physical test database).
    if (profile.promotion === null) {
      await prisma.studentProfile.update({ where: { id: profile.id }, data: { promotion: "L2" } });
    }
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
        // Same BR-02 reasoning as the promotion fix above: a real PENDING
        // stage always has these non-blank, so a status: "PENDING" override
        // here without its own service/projectType/motivation would create
        // the same kind of impossible row.
        service: "Service de test",
        projectType: "Type de handicap de test",
        motivation: "Motivation de test",
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

  // Issue #162: a decided stage is read from its frozen snapshot (ADR-0033).
  describe("BR-08: a decided stage is read from its snapshot", () => {
    it("GET /stages/:id: serves a VALIDATED stage from its snapshot, unaffected by later edits to the organism, tutor or referent (BR-08)", async () => {
      const me = await signup();
      const stage = await seedStage(me.email, {
        status: "VALIDATED",
        submittedAt: new Date("2099-09-01"),
        decidedAt: new Date("2025-09-10T09:30:00.000Z"),
        snapshotVersion: 1,
        snapshot: snapshotV1({ schoolYear: "2099-2100" }),
      });
      // Edited after the decision: the frozen document must not follow.
      await prisma.hostOrganism.update({
        where: { id: stage.organismId! },
        data: { name: "Renommé depuis la validation" },
      });
      await prisma.tutor.update({
        where: { id: stage.tutorId! },
        data: { lastName: "Renommée" },
      });
      const referentEmail = `e2e.referent.${randomUUID()}@univ.fr`;
      createdReferentEmails.push(referentEmail);
      const otherReferent = await prisma.user.create({
        data: {
          email: referentEmail,
          passwordHash: "x",
          firstName: "Autre",
          lastName: "Référent",
          roles: ["REFERENT"],
          referentProfile: { create: {} },
        },
        include: { referentProfile: true },
      });
      await prisma.referentAssignment.create({
        data: {
          studentId: stage.studentId,
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: true,
          referentId: otherReferent.referentProfile!.id,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/stages/${stage.id}`)
        .set("Cookie", cookie(me.token))
        .expect(200);

      expect(response.body).toMatchObject({
        id: stage.id,
        status: "VALIDATED",
        schoolYear: "2099-2100",
        organism: { name: "Hôpital Cochin", editable: false },
        tutor: { lastName: "Curie", editable: false },
        periods: [{ id: "p1", startDate: "2025-10-01T00:00:00.000Z" }],
        referent: { id: "ref-1", firstName: "Jean", lastName: "Valjean" },
        submittedAt: "2099-09-01T00:00:00.000Z",
        decidedAt: "2025-09-10T09:30:00.000Z",
        refusalReason: null,
      });
      // Frozen in the snapshot, but not the student's to read.
      expect(response.body).not.toHaveProperty("decidedBy");
      expect(response.body).not.toHaveProperty("promotion");
    });

    it("GET /stages/:id: a REFUSED stage carries its refusal reason next to the snapshot content (BR-08)", async () => {
      const me = await signup();
      const stage = await seedStage(me.email, {
        status: "REFUSED",
        refusalReason: "Dates incompatibles",
        snapshotVersion: 1,
        snapshot: snapshotV1(),
      });

      const response = await request(app.getHttpServer())
        .get(`/stages/${stage.id}`)
        .set("Cookie", cookie(me.token))
        .expect(200);

      expect(response.body).toMatchObject({
        status: "REFUSED",
        refusalReason: "Dates incompatibles",
        organism: { name: "Hôpital Cochin" },
      });
    });

    it.each([
      ["missing", {}],
      ["of an unknown version", { snapshotVersion: 99, snapshot: snapshotV1() }],
      ["unparseable", { snapshotVersion: 1, snapshot: { schoolYear: "not a year" } }],
    ])(
      "GET /stages/:id: 500, never the live rows, when a decided stage's snapshot is %s (BR-08)",
      async (_case, overrides) => {
        const me = await signup();
        const stage = await seedStage(me.email, { status: "VALIDATED", ...overrides });

        await request(app.getHttpServer())
          .get(`/stages/${stage.id}`)
          .set("Cookie", cookie(me.token))
          .expect(500);
      },
    );

    it("GET /stages: lists a decided stage from its snapshot and a live one from its live rows (BR-08)", async () => {
      const me = await signup();
      const live = await seedStage(me.email, { status: "PENDING", submittedAt: new Date() });
      const decided = await seedStage(me.email, {
        status: "VALIDATED",
        snapshotVersion: 1,
        snapshot: snapshotV1(),
      });
      await prisma.hostOrganism.update({
        where: { id: decided.organismId! },
        data: { name: "Renommé depuis la validation" },
      });
      const liveOrganism = await prisma.hostOrganism.findUniqueOrThrow({
        where: { id: live.organismId! },
      });

      const response = await request(app.getHttpServer())
        .get("/stages")
        .set("Cookie", cookie(me.token))
        .expect(200);

      const byId = new Map(response.body.map((item: { id: string }) => [item.id, item]));
      expect(byId.get(live.id)).toMatchObject({
        organismName: liveOrganism.name,
        schoolYear: "2099-2100",
      });
      expect(byId.get(decided.id)).toMatchObject({
        organismName: "Hôpital Cochin",
        schoolYear: "2025-2026",
        periods: [{ id: "p1", startDate: "2025-10-01T00:00:00.000Z" }],
      });
    });

    it("GET /stages: still lists the student's other stages when a decided one's snapshot is unreadable (BR-08)", async () => {
      const me = await signup();
      const live = await seedStage(me.email, { status: "PENDING", submittedAt: new Date() });
      const broken = await seedStage(me.email, { status: "REFUSED" });

      const response = await request(app.getHttpServer())
        .get("/stages")
        .set("Cookie", cookie(me.token))
        .expect(200);

      expect(response.body.map((item: { id: string }) => item.id).sort()).toEqual(
        [live.id, broken.id].sort(),
      );
      expect(response.body.find((item: { id: string }) => item.id === broken.id)).toMatchObject({
        organismName: null,
        periods: [],
      });
    });
  });
});
