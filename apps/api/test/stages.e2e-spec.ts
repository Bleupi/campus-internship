import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

function uniqueEmail(): string {
  return `e2e.stages.${randomUUID()}@etu.u-paris.fr`;
}

function organismPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Hôpital Cochin",
    structureType: "Hôpital",
    city: "Paris",
    postalCode: "75014",
    street: "27 Rue du Faubourg Saint-Jacques",
    ...overrides,
  };
}

function tutorPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Marie",
    lastName: "Curie",
    email: "m.curie@example.org",
    jobTitle: "Médecin",
    acceptsPhoneContact: false,
    ...overrides,
  };
}

describe("Stages draft creation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserEmails: string[] = [];
  const createdOrganismIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Stage.studentId has no onDelete cascade (dataModel.md) — the stages
    // this test suite created must go first, or deleting the user (which
    // cascades to StudentProfile) violates that FK. Tutor.organismId has no
    // cascade either, so it goes before the organism it belongs to.
    await prisma.stage.deleteMany({
      where: { student: { user: { email: { in: createdUserEmails } } } },
    });
    await prisma.tutor.deleteMany({ where: { organismId: { in: createdOrganismIds } } });
    await prisma.hostOrganism.deleteMany({ where: { id: { in: createdOrganismIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await app.close();
  });

  async function signupAndGetAccessToken(): Promise<string> {
    const email = uniqueEmail();
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
    return requireCookie(cookieMap(response), "access_token");
  }

  function authCookie(accessToken: string): string {
    return cookieHeader({ access_token: accessToken });
  }

  async function seedOrganismWithTutor() {
    const organism = await prisma.hostOrganism.create({
      data: { ...organismPayload(), tutors: { create: tutorPayload() } },
      include: { tutors: true },
    });
    createdOrganismIds.push(organism.id);
    return { organism, tutor: organism.tutors[0]! };
  }

  it("POST /stages: 401 without a cookie", async () => {
    await request(app.getHttpServer()).post("/stages").send({}).expect(401);
  });

  it("POST /stages: 400 on a body that fails BR-04c (overlapping periods), via the real ZodValidationPipe", async () => {
    const accessToken = await signupAndGetAccessToken();
    const { organism, tutor } = await seedOrganismWithTutor();

    await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "existing", id: organism.id },
        tutor: { mode: "existing", id: tutor.id },
        periods: [
          { startDate: "2025-10-01", endDate: "2025-10-15" },
          { startDate: "2025-10-10", endDate: "2025-10-20" },
        ],
        mandatory: true,
      })
      .expect(400);
  });

  it("POST /stages: creates a DRAFT with an existing organism/tutor, deriving schoolYear/semester server-side", async () => {
    const accessToken = await signupAndGetAccessToken();
    const { organism, tutor } = await seedOrganismWithTutor();

    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "existing", id: organism.id },
        tutor: { mode: "existing", id: tutor.id },
        // Client sends a bogus semester too — createStageDraftSchema has no
        // such field, so it's simply dropped, never persisted (BR-04b).
        semester: "S2",
        periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
        mandatory: true,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "DRAFT",
      schoolYear: "2025-2026",
      semester: "S1",
      mandatory: true,
      organism: { id: organism.id },
      tutor: { id: tutor.id },
    });
    expect(response.body.periods).toHaveLength(1);

    const persisted = await prisma.stage.findUnique({
      where: { id: response.body.id },
      include: { periods: true },
    });
    expect(persisted?.periods).toHaveLength(1);
  });

  it("POST /stages: creates a new organism + new tutor inline, in the same transaction", async () => {
    const accessToken = await signupAndGetAccessToken();

    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "new", data: organismPayload({ name: "Fondation OVE" }) },
        tutor: { mode: "new", data: tutorPayload({ email: "k.belkacem@example.org" }) },
        periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
        mandatory: false,
      })
      .expect(201);
    createdOrganismIds.push(response.body.organism.id);

    expect(response.body.organism.name).toBe("Fondation OVE");
    expect(response.body.tutor.email).toBe("k.belkacem@example.org");

    const organismRow = await prisma.hostOrganism.findUnique({
      where: { id: response.body.organism.id },
    });
    expect(organismRow).not.toBeNull();
  });

  it("POST /stages: a mid-transaction failure (tutor belongs to a different organism) leaves no orphaned organism row", async () => {
    const accessToken = await signupAndGetAccessToken();
    const { tutor: unrelatedTutor } = await seedOrganismWithTutor();

    const before = await prisma.hostOrganism.count();

    await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "new", data: organismPayload({ name: "Institut Le Val Mandé" }) },
        // This tutor belongs to a DIFFERENT organism than the one just
        // created inline above — resolveTutor rejects it, rolling back the
        // whole transaction, including the just-created organism.
        tutor: { mode: "existing", id: unrelatedTutor.id },
        periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
        mandatory: true,
      })
      .expect(400);

    const after = await prisma.hostOrganism.count();
    expect(after).toBe(before);
  });

  // Postgres text columns reject the NUL character, but Zod happily accepts
  // it, so it's a way to make the INSERT itself fail after validation passed.
  it("POST /stages: 500 with a clear message and no stage when the new organism can't be inserted", async () => {
    const accessToken = await signupAndGetAccessToken();
    const stagesBefore = await prisma.stage.count();

    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "new", data: organismPayload({ name: "Fondation\u0000OVE" }) },
        tutor: { mode: "new", data: tutorPayload() },
        periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
        mandatory: true,
      })
      .expect(500);

    expect(response.body.message).toBe(
      "Impossible de créer l'organisme. Le brouillon n'a pas été enregistré.",
    );
    expect(await prisma.stage.count()).toBe(stagesBefore);
  });

  it("POST /stages: 500 with a clear message, and the just-created organism rolled back, when the new tutor can't be inserted", async () => {
    const accessToken = await signupAndGetAccessToken();
    const organismName = `Rollback ${randomUUID()}`;
    const stagesBefore = await prisma.stage.count();

    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", authCookie(accessToken))
      .send({
        organism: { mode: "new", data: organismPayload({ name: organismName }) },
        tutor: { mode: "new", data: tutorPayload({ firstName: "Marie\u0000" }) },
        periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
        mandatory: true,
      })
      .expect(500);

    expect(response.body.message).toBe(
      "Impossible de créer le tuteur. Le brouillon n'a pas été enregistré.",
    );
    expect(await prisma.stage.count()).toBe(stagesBefore);
    expect(await prisma.hostOrganism.count({ where: { name: organismName } })).toBe(0);
  });
});
