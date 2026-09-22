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
  return `e2e.edit.${prefix}.${randomUUID()}@etu.u-paris.fr`;
}

const year = Number(getCurrentSchoolYear().slice(0, 4));

const organismData = {
  name: "Hôpital Necker",
  structureType: "Secteur Sanitaire",
  city: "Paris",
  postalCode: "75015",
  street: "149 Rue de Sèvres",
};
const tutorData = {
  firstName: "Pierre",
  lastName: "Curie",
  email: "p.curie@example.org",
  jobTitle: "Chef de service",
  phone: null,
  acceptsPhoneContact: false,
};

describe("Edit a draft (e2e, issue #116)", () => {
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

  // Creates a draft through the API, on its own inline-created organism/tutor
  // (so the row starts unfrozen, as after issue #113) unless told otherwise.
  async function createDraft(cookie: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post("/stages")
      .set("Cookie", cookie)
      .send({
        organism: { mode: "new", data: { ...organismData, name: "Hôpital Cochin" } },
        tutor: { mode: "new", data: { ...tutorData, firstName: "Marie" } },
        periods: [{ startDate: `${year}-10-01`, endDate: `${year}-10-15` }],
        mandatory: true,
        ...overrides,
      })
      .expect(201);
    createdOrganismIds.push(response.body.organism.id);
    return response.body as {
      id: string;
      version: number;
      organism: { id: string; editable: boolean };
      tutor: { id: string; editable: boolean };
    };
  }

  function patch(cookie: string, stageId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/stages/${stageId}`)
      .set("Cookie", cookie)
      .send(body);
  }

  function editBody(draft: Awaited<ReturnType<typeof createDraft>>, overrides = {}) {
    return {
      version: draft.version,
      organism: { mode: "existing", id: draft.organism.id },
      tutor: { mode: "existing", id: draft.tutor.id },
      periods: [{ startDate: `${year}-10-01`, endDate: `${year}-10-15` }],
      mandatory: true,
      ...overrides,
    };
  }

  it("401 without a cookie", async () => {
    await request(app.getHttpServer()).patch(`/stages/${randomUUID()}`).send({}).expect(401);
  });

  it("updates a draft's fields and periods, bumps the version, and BR-04b re-derives the semester (a client-supplied one is ignored)", async () => {
    const cookie = await signup();
    const draft = await createDraft(cookie);

    const response = await patch(
      cookie,
      draft.id,
      editBody(draft, {
        periods: [{ startDate: `${year + 1}-03-02`, endDate: `${year + 1}-03-13` }],
        mandatory: false,
        service: "Cardiologie",
        semester: "S1",
      }),
    ).expect(200);

    expect(response.body).toMatchObject({
      id: draft.id,
      version: draft.version + 1,
      semester: "S2",
      mandatory: false,
      service: "Cardiologie",
    });
    expect(response.body.periods).toHaveLength(1);
    expect(response.body.periods[0].startDate).toMatch(new RegExp(`^${year + 1}-03-02`));
  });

  it("BR-09: 409 with the version-conflict code, and nothing applied, when the version is stale", async () => {
    const cookie = await signup();
    const draft = await createDraft(cookie);
    await patch(cookie, draft.id, editBody(draft, { service: "Première édition" })).expect(200);

    const response = await patch(
      cookie,
      draft.id,
      editBody(draft, { service: "Écrasement" }),
    ).expect(409);

    expect(response.body.code).toBe("STAGE_VERSION_CONFLICT");
    expect((await prisma.stage.findUniqueOrThrow({ where: { id: draft.id } })).service).toBe(
      "Première édition",
    );
  });

  it("a stale write that also edits the organism rolls the organism edit back", async () => {
    const cookie = await signup();
    const draft = await createDraft(cookie);
    await patch(cookie, draft.id, editBody(draft)).expect(200);

    await patch(
      cookie,
      draft.id,
      editBody(draft, { organism: { mode: "edit", id: draft.organism.id, data: organismData } }),
    ).expect(409);

    const organism = await prisma.hostOrganism.findUniqueOrThrow({
      where: { id: draft.organism.id },
    });
    expect(organism.name).toBe("Hôpital Cochin");
  });

  it("404 for another student's stage", async () => {
    const draft = await createDraft(await signup());

    await patch(await signup(), draft.id, editBody(draft)).expect(404);
  });

  it.each(["PENDING", "VALIDATED", "REFUSED"] as const)(
    "409 when the stage is %s, not DRAFT",
    async (status) => {
      const cookie = await signup();
      const draft = await createDraft(cookie);
      await prisma.stage.update({
        where: { id: draft.id },
        data: { status, submittedAt: new Date() },
      });

      const response = await patch(cookie, draft.id, editBody(draft)).expect(409);

      expect(response.body.code).toBe("STAGE_NOT_DRAFT");
    },
  );

  it("edits the organism and the tutor in place while they are unfrozen", async () => {
    const cookie = await signup();
    const draft = await createDraft(cookie);
    expect(draft.organism.editable).toBe(true);
    expect(draft.tutor.editable).toBe(true);

    const response = await patch(
      cookie,
      draft.id,
      editBody(draft, {
        organism: { mode: "edit", id: draft.organism.id, data: organismData },
        tutor: { mode: "edit", id: draft.tutor.id, data: tutorData },
      }),
    ).expect(200);

    expect(response.body.organism).toMatchObject({ id: draft.organism.id, name: "Hôpital Necker" });
    expect(response.body.tutor).toMatchObject({ id: draft.tutor.id, firstName: "Pierre" });
  });

  describe("freeze, from both trigger paths", () => {
    it("trigger 1: a second student's DRAFT referencing the organism freezes it, and the first student's edit is rejected", async () => {
      const cookie = await signup();
      const draft = await createDraft(cookie);
      await createDraft(await signup(), {
        organism: { mode: "existing", id: draft.organism.id },
        tutor: { mode: "existing", id: draft.tutor.id },
      });

      const read = await request(app.getHttpServer())
        .get(`/stages/${draft.id}`)
        .set("Cookie", cookie)
        .expect(200);
      expect(read.body.organism.editable).toBe(false);
      expect(read.body.tutor.editable).toBe(false);

      const response = await patch(
        cookie,
        draft.id,
        editBody(draft, { organism: { mode: "edit", id: draft.organism.id, data: organismData } }),
      ).expect(409);
      expect(response.body.code).toBe("STAGE_ROW_FROZEN");
      await patch(
        cookie,
        draft.id,
        editBody(draft, { tutor: { mode: "edit", id: draft.tutor.id, data: tutorData } }),
      ).expect(409);
    });

    it.each(["PENDING", "VALIDATED", "REFUSED"] as const)(
      "trigger 2: a referencing stage leaving DRAFT (%s) freezes the organism and the tutor",
      async (status) => {
        const cookie = await signup();
        const draft = await createDraft(cookie);
        const sibling = await createDraft(cookie, {
          organism: { mode: "existing", id: draft.organism.id },
          tutor: { mode: "existing", id: draft.tutor.id },
        });
        await prisma.stage.update({
          where: { id: sibling.id },
          data: { status, submittedAt: new Date() },
        });

        await patch(
          cookie,
          draft.id,
          editBody(draft, {
            organism: { mode: "edit", id: draft.organism.id, data: organismData },
          }),
        ).expect(409);
        await patch(
          cookie,
          draft.id,
          editBody(draft, { tutor: { mode: "edit", id: draft.tutor.id, data: tutorData } }),
        ).expect(409);
      },
    );

    it("a student's own second DRAFT on the same organism does not freeze it", async () => {
      const cookie = await signup();
      const draft = await createDraft(cookie);
      await createDraft(cookie, {
        organism: { mode: "existing", id: draft.organism.id },
        tutor: { mode: "existing", id: draft.tutor.id },
      });

      await patch(
        cookie,
        draft.id,
        editBody(draft, { organism: { mode: "edit", id: draft.organism.id, data: organismData } }),
      ).expect(200);
    });

    it("a brand-new tutor can still be added to a frozen organism", async () => {
      const cookie = await signup();
      const draft = await createDraft(cookie);
      await createDraft(await signup(), {
        organism: { mode: "existing", id: draft.organism.id },
        tutor: { mode: "existing", id: draft.tutor.id },
      });

      const response = await patch(
        cookie,
        draft.id,
        editBody(draft, { tutor: { mode: "new", data: tutorData } }),
      ).expect(200);

      expect(response.body.organism.id).toBe(draft.organism.id);
      expect(response.body.tutor).toMatchObject({ firstName: "Pierre", editable: true });
    });

    it("cannot edit an organism the draft doesn't point to, even an unreferenced one", async () => {
      const cookie = await signup();
      const draft = await createDraft(cookie);
      const other = await prisma.hostOrganism.create({ data: organismData });
      createdOrganismIds.push(other.id);

      await patch(
        cookie,
        draft.id,
        editBody(draft, { organism: { mode: "edit", id: other.id, data: organismData } }),
      ).expect(400);
    });
  });
});
