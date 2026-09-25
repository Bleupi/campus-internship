import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { getCurrentSchoolYear } from "shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";
import { purgeE2eData } from "./helpers/cleanup";

function uniqueEmail(prefix: string): string {
  return `e2e.duplicate.${prefix}.${randomUUID()}@etu.u-paris.fr`;
}

const schoolYearStartYear = getCurrentSchoolYear().slice(0, 4);

describe("Stage duplication (e2e, issue #117)", () => {
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
    await purgeE2eData(prisma, {
      userEmails: createdUserEmails,
      organismIds: createdOrganismIds,
    });
    await app.close();
  });

  async function signup(): Promise<string> {
    const email = uniqueEmail("student");
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
    return cookieHeader({ access_token: requireCookie(cookieMap(response), "access_token") });
  }

  async function createDraft(cookie: string): Promise<string> {
    const organism = await prisma.hostOrganism.create({
      data: {
        name: "Hôpital Cochin",
        structureType: "Secteur Sanitaire",
        city: "Paris",
        postalCode: "75014",
        street: "27 Rue du Faubourg Saint-Jacques",
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

    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", cookie)
      .send({
        organism: { mode: "existing", id: organism.id },
        tutor: { mode: "existing", id: organism.tutors[0]!.id },
        periods: [
          { startDate: `${schoolYearStartYear}-10-01`, endDate: `${schoolYearStartYear}-10-15` },
          { startDate: `${schoolYearStartYear}-11-03`, endDate: `${schoolYearStartYear}-11-14` },
        ],
        mandatory: true,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Je souhaite découvrir le métier.",
      })
      .expect(201);
    return response.body.id as string;
  }

  it("POST /stages/:id/duplicate: 401 without a cookie", async () => {
    await request(app.getHttpServer()).post(`/stages/${randomUUID()}/duplicate`).expect(401);
  });

  it("copies a REFUSED stage into a fresh DRAFT: every field and period carried, lifecycle fields reset, parentStageId set, and it shows up in the list", async () => {
    const cookie = await signup();
    const sourceId = await createDraft(cookie);
    await prisma.stage.update({
      where: { id: sourceId },
      data: {
        status: "REFUSED",
        submittedAt: new Date("2025-09-15"),
        refusalReason: "Dates incompatibles",
        decidedAt: new Date("2025-09-20"),
        snapshot: { organism: { name: "Hôpital Cochin" } },
        snapshotVersion: 1,
        version: 4,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/stages/${sourceId}/duplicate`)
      .set("Cookie", cookie)
      .expect(201);

    expect(response.body).toMatchObject({
      status: "DRAFT",
      version: 0,
      mandatory: true,
      service: "Cardiologie",
      projectType: "Handicap moteur",
      motivation: "Je souhaite découvrir le métier.",
    });
    expect(response.body.id).not.toBe(sourceId);
    expect(response.body.periods).toHaveLength(2);

    const source = await prisma.stage.findUniqueOrThrow({
      where: { id: sourceId },
      include: { periods: true },
    });
    const copy = await prisma.stage.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { periods: true },
    });
    expect(copy).toMatchObject({
      status: "DRAFT",
      parentStageId: sourceId,
      organismId: source.organismId,
      tutorId: source.tutorId,
      schoolYear: source.schoolYear,
      semester: source.semester,
      submittedAt: null,
      refusalReason: null,
      decidedAt: null,
      snapshot: null,
      snapshotVersion: null,
    });
    expect(copy.periods.map((p) => [p.startDate, p.endDate]).sort()).toEqual(
      source.periods.map((p) => [p.startDate, p.endDate]).sort(),
    );
    expect(copy.periods.map((p) => p.id)).not.toEqual(
      expect.arrayContaining([source.periods[0]!.id]),
    );
    // The source is left untouched.
    expect(source).toMatchObject({ status: "REFUSED", refusalReason: "Dates incompatibles" });

    const list = await request(app.getHttpServer())
      .get("/stages")
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body.map((stage: { id: string }) => stage.id)).toContain(response.body.id);
  });

  it.each(["DRAFT", "PENDING", "VALIDATED"] as const)(
    "succeeds from a %s source",
    async (status) => {
      const cookie = await signup();
      const sourceId = await createDraft(cookie);
      // A consistent row for its status: the admin queue lists every PENDING
      // stage in the shared e2e database, and a PENDING one without a
      // submission date would break that suite when run concurrently.
      await prisma.stage.update({
        where: { id: sourceId },
        data: {
          status,
          ...(status !== "DRAFT" && { submittedAt: new Date("2099-01-05T09:00:00.000Z") }),
          ...(status === "VALIDATED" && { decidedAt: new Date("2099-01-06T09:00:00.000Z") }),
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/stages/${sourceId}/duplicate`)
        .set("Cookie", cookie)
        .expect(201);

      expect(response.body.status).toBe("DRAFT");
    },
  );

  it("404 for another student's stage, and nothing is created", async () => {
    const owner = await signup();
    const stranger = await signup();
    const sourceId = await createDraft(owner);

    await request(app.getHttpServer())
      .post(`/stages/${sourceId}/duplicate`)
      .set("Cookie", stranger)
      .expect(404);

    expect(await prisma.stage.count({ where: { parentStageId: sourceId } })).toBe(0);
  });
});
