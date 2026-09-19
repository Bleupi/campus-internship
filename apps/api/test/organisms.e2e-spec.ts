import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { cookieHeader, cookieMap, requireCookie } from "./helpers/cookies";

function uniqueEmail(): string {
  return `e2e.organisms.${randomUUID()}@etu.u-paris.fr`;
}

describe("Organisms search/detail (e2e)", () => {
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

  it("GET /organisms/search: 401 without a cookie", async () => {
    await request(app.getHttpServer()).get("/organisms/search?q=cochin").expect(401);
  });

  it("GET /organisms/search: finds a seeded organism case- and accent-insensitively (ILIKE + unaccent)", async () => {
    const accessToken = await signupAndGetAccessToken();
    const organism = await prisma.hostOrganism.create({
      data: {
        name: `Hôpital Écoblanc ${randomUUID()}`,
        structureType: "Secteur Sanitaire",
        city: "Paris",
        postalCode: "75014",
        street: "1 rue Test",
      },
    });
    createdOrganismIds.push(organism.id);

    const response = await request(app.getHttpServer())
      .get(`/organisms/search?q=${encodeURIComponent("ecoblanc")}`)
      .set("Cookie", authCookie(accessToken))
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: organism.id, name: organism.name })]),
    );
  });

  it("GET /organisms/search: an empty query returns an empty array (no full-table scan)", async () => {
    const accessToken = await signupAndGetAccessToken();

    const response = await request(app.getHttpServer())
      .get("/organisms/search?q=")
      .set("Cookie", authCookie(accessToken))
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it("GET /organisms/:id: returns the organism with an empty tutors array right after creation", async () => {
    const accessToken = await signupAndGetAccessToken();
    const organism = await prisma.hostOrganism.create({
      data: {
        name: "Fondation OVE",
        structureType: "Secteur Associatif",
        city: "Lyon",
        postalCode: "69000",
        street: "1 rue de la République",
      },
    });
    createdOrganismIds.push(organism.id);

    const response = await request(app.getHttpServer())
      .get(`/organisms/${organism.id}`)
      .set("Cookie", authCookie(accessToken))
      .expect(200);

    expect(response.body.tutors).toEqual([]);
  });

  it("GET /organisms/:id: 404 for an organism that doesn't exist", async () => {
    const accessToken = await signupAndGetAccessToken();

    await request(app.getHttpServer())
      .get(`/organisms/${randomUUID()}`)
      .set("Cookie", authCookie(accessToken))
      .expect(404);
  });

  it("GET /organisms/structure-types: returns the seeded structure types", async () => {
    const accessToken = await signupAndGetAccessToken();

    const response = await request(app.getHttpServer())
      .get("/organisms/structure-types")
      .set("Cookie", authCookie(accessToken))
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
