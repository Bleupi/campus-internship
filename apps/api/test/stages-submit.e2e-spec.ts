import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { getCurrentSchoolYear } from "shared";
import { AppModule } from "../src/app.module";
import { MailerService } from "../src/modules/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";
import { purgeE2eData } from "./helpers/cleanup";

function uniqueEmail(prefix: string): string {
  return `e2e.submit.${prefix}.${randomUUID()}@etu.u-paris.fr`;
}

// Periods sit in the current school year, so the previous-year rule never
// depends on when the suite runs.
const schoolYearStartYear = getCurrentSchoolYear().slice(0, 4);

describe("Stage submission (e2e, issue #115)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: { sendSafely: jest.Mock };
  const createdUserEmails: string[] = [];
  const createdOrganismIds: string[] = [];

  beforeAll(async () => {
    mailer = { sendSafely: jest.fn().mockResolvedValue(undefined) };
    // Swapped for a stub: e2e must never call Scaleway (ADR-0026).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue(mailer)
      .compile();
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

  beforeEach(() => mailer.sendSafely.mockClear());

  async function signup(): Promise<{ cookie: string; email: string }> {
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
    return {
      cookie: cookieHeader({ access_token: requireCookie(cookieMap(response), "access_token") }),
      email,
    };
  }

  async function createDraft(cookie: string, overrides: Record<string, unknown> = {}) {
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
        ],
        mandatory: true,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Je souhaite découvrir le métier.",
        ...overrides,
      })
      .expect(201);
    return response.body.id as string;
  }

  async function setProfileStatus(email: string, profileStatus: "VALID" | "INCOMPLETE") {
    await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { profileStatus },
    });
  }

  it("POST /stages/:id/submit: 401 without a cookie", async () => {
    await request(app.getHttpServer()).post(`/stages/${randomUUID()}/submit`).expect(401);
  });

  it("BR-02: 400 naming the profile, and the stage stays DRAFT, when the profile is not VALID", async () => {
    const { cookie } = await signup();
    const stageId = await createDraft(cookie);

    const response = await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", cookie)
      .expect(400);

    expect(JSON.stringify(response.body.message)).toMatch(/profil/);
    expect((await prisma.stage.findUniqueOrThrow({ where: { id: stageId } })).status).toBe("DRAFT");
    expect(mailer.sendSafely).not.toHaveBeenCalled();
  });

  it("submission-completeness: 400 naming the missing field for an incomplete draft", async () => {
    const { cookie, email } = await signup();
    await setProfileStatus(email, "VALID");
    const stageId = await createDraft(cookie, { motivation: undefined });

    const response = await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", cookie)
      .expect(400);

    expect(JSON.stringify(response.body.message)).toMatch(/motivation/);
  });

  it("BR-07/BR-09: submits a complete draft (DRAFT -> PENDING, submittedAt, version bumped) and emails the admins, then refuses a second submit with 409", async () => {
    const adminEmail = uniqueEmail("admin");
    createdUserEmails.push(adminEmail);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: "not-a-real-hash",
        firstName: "Ad",
        lastName: "Min",
        roles: ["ADMIN"],
      },
    });
    const { cookie, email } = await signup();
    await setProfileStatus(email, "VALID");
    const stageId = await createDraft(cookie);

    const response = await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", cookie)
      .expect(201);

    expect(response.body).toMatchObject({ id: stageId, status: "PENDING" });
    expect(response.body.submittedAt).toEqual(expect.any(String));
    const persisted = await prisma.stage.findUniqueOrThrow({ where: { id: stageId } });
    expect(persisted.status).toBe("PENDING");
    expect(persisted.version).toBe(1);
    expect(mailer.sendSafely).toHaveBeenCalledWith(
      expect.objectContaining({ to: { email: adminEmail } }),
      expect.anything(),
    );

    await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", cookie)
      .expect(409);
  });

  it("BR-01: 400 for a draft in the previous school year, which can still be saved as a draft", async () => {
    const { cookie, email } = await signup();
    await setProfileStatus(email, "VALID");
    const previousYear = Number(schoolYearStartYear) - 1;
    const stageId = await createDraft(cookie, {
      periods: [{ startDate: `${previousYear}-10-01`, endDate: `${previousYear}-10-15` }],
    });

    const response = await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", cookie)
      .expect(400);

    expect(JSON.stringify(response.body.message)).toMatch(/année scolaire précédente/);
    expect((await prisma.stage.findUniqueOrThrow({ where: { id: stageId } })).status).toBe("DRAFT");
  });

  it("404 when the stage belongs to another student", async () => {
    const owner = await signup();
    await setProfileStatus(owner.email, "VALID");
    const stageId = await createDraft(owner.cookie);
    const intruder = await signup();
    await setProfileStatus(intruder.email, "VALID");

    await request(app.getHttpServer())
      .post(`/stages/${stageId}/submit`)
      .set("Cookie", intruder.cookie)
      .expect(404);
    expect((await prisma.stage.findUniqueOrThrow({ where: { id: stageId } })).status).toBe("DRAFT");
  });
});
