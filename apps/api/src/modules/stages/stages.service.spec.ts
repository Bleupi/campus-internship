import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateStageDraftRequest } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import { StagesService } from "./stages.service";

const USER_ID = "user-1";
const PROFILE_ID = "profile-1";
const ORGANISM_ID = "11111111-1111-1111-1111-111111111111";
const TUTOR_ID = "22222222-2222-2222-2222-222222222222";

function basePayload(overrides: Partial<CreateStageDraftRequest> = {}): CreateStageDraftRequest {
  return {
    organism: { mode: "existing", id: ORGANISM_ID },
    tutor: { mode: "existing", id: TUTOR_ID },
    periods: [{ startDate: new Date("2025-10-01"), endDate: new Date("2025-10-15") }],
    mandatory: true,
    ...overrides,
  } as CreateStageDraftRequest;
}

function organismRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORGANISM_ID,
    name: "Hôpital Cochin",
    structureType: "Secteur Sanitaire",
    city: "Paris",
    postalCode: "75014",
    street: "27 Rue du Faubourg Saint-Jacques",
    ...overrides,
  };
}

function tutorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TUTOR_ID,
    firstName: "Marie",
    lastName: "Curie",
    email: "m.curie@example.org",
    jobTitle: "Médecin",
    phone: null,
    acceptsPhoneContact: false,
    organismId: ORGANISM_ID,
    ...overrides,
  };
}

function stageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage-1",
    status: "DRAFT",
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    service: null,
    projectType: null,
    motivation: null,
    organism: organismRow(),
    tutor: tutorRow(),
    periods: [
      {
        id: "period-1",
        startDate: new Date("2025-10-01"),
        endDate: new Date("2025-10-15"),
      },
    ],
    ...overrides,
  };
}

describe("StagesService", () => {
  let service: StagesService;
  let prisma: {
    studentProfile: { findUnique: jest.Mock };
    hostOrganism: { findUnique: jest.Mock; create: jest.Mock };
    tutor: { findFirst: jest.Mock; create: jest.Mock };
    stage: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    user: { findMany: jest.Mock };
    referentAssignment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailerService: { sendSafely: jest.Mock };

  beforeEach(async () => {
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      hostOrganism: { findUnique: jest.fn(), create: jest.fn() },
      tutor: { findFirst: jest.fn(), create: jest.fn() },
      stage: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findMany: jest.fn() },
      referentAssignment: { findUnique: jest.fn() },
      $transaction: jest.fn((arg) => arg(prisma)),
    };
    prisma.studentProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, userId: USER_ID });
    mailerService = { sendSafely: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        StagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get(StagesService);
  });

  it("throws NotFoundException when the caller has no student profile", async () => {
    prisma.studentProfile.findUnique.mockResolvedValue(null);

    await expect(service.createDraft(USER_ID, basePayload())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe("existing organism + existing tutor", () => {
    it("resolves both by id and persists the stage without creating any new row", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue(organismRow());
      prisma.tutor.findFirst.mockResolvedValue(tutorRow());
      prisma.stage.create.mockResolvedValue(stageRow());

      const result = await service.createDraft(USER_ID, basePayload());

      expect(prisma.hostOrganism.create).not.toHaveBeenCalled();
      expect(prisma.tutor.create).not.toHaveBeenCalled();
      expect(prisma.stage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: PROFILE_ID,
            organismId: ORGANISM_ID,
            tutorId: TUTOR_ID,
            mandatory: true,
          }),
        }),
      );
      expect(result.id).toBe("stage-1");
    });

    it("rejects an existing-organism id that doesn't exist", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue(null);

      await expect(service.createDraft(USER_ID, basePayload())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.stage.create).not.toHaveBeenCalled();
    });

    it("rejects a tutor that doesn't belong to the resolved organism, without creating the stage", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue(organismRow());
      prisma.tutor.findFirst.mockResolvedValue(null); // wrong organismId, findFirst finds nothing

      await expect(service.createDraft(USER_ID, basePayload())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.stage.create).not.toHaveBeenCalled();
    });
  });

  describe("new organism + new tutor (inline creation)", () => {
    it("creates both rows inside the same transaction and links the stage to them", async () => {
      const newOrganismData = {
        name: "Fondation OVE",
        structureType: "Secteur Associatif",
        city: "Lyon",
        postalCode: "69000",
        street: "1 rue de la République",
      };
      const newTutorData = {
        firstName: "Karim",
        lastName: "Belkacem",
        email: "k.belkacem@example.org",
        jobTitle: "Directeur",
        acceptsPhoneContact: false,
      };
      prisma.hostOrganism.create.mockResolvedValue({ id: "new-org-id", ...newOrganismData });
      prisma.tutor.create.mockResolvedValue({
        id: "new-tutor-id",
        ...newTutorData,
        organismId: "new-org-id",
      });
      prisma.stage.create.mockResolvedValue(
        stageRow({
          organism: { id: "new-org-id", ...newOrganismData },
          tutor: { id: "new-tutor-id", ...newTutorData, phone: null, acceptsPhoneContact: false },
        }),
      );

      await service.createDraft(
        USER_ID,
        basePayload({
          organism: { mode: "new", data: newOrganismData },
          tutor: { mode: "new", data: newTutorData },
        }),
      );

      expect(prisma.hostOrganism.create).toHaveBeenCalledWith({ data: newOrganismData });
      expect(prisma.tutor.create).toHaveBeenCalledWith({
        data: { ...newTutorData, organismId: "new-org-id" },
      });
      expect(prisma.stage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organismId: "new-org-id", tutorId: "new-tutor-id" }),
        }),
      );
    });
  });

  describe("mixed existing organism + new tutor", () => {
    it("creates the tutor scoped to the resolved existing organism", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue(organismRow());
      const newTutorData = {
        firstName: "Sophie",
        lastName: "Nguyen",
        email: "s.nguyen@example.org",
        jobTitle: "Chef de service",
        acceptsPhoneContact: true,
      };
      prisma.tutor.create.mockResolvedValue({
        id: "new-tutor-id",
        ...newTutorData,
        organismId: ORGANISM_ID,
      });
      prisma.stage.create.mockResolvedValue(
        stageRow({ tutor: { ...tutorRow(), ...newTutorData, id: "new-tutor-id" } }),
      );

      await service.createDraft(
        USER_ID,
        basePayload({ tutor: { mode: "new", data: newTutorData } }),
      );

      expect(prisma.tutor.create).toHaveBeenCalledWith({
        data: { ...newTutorData, organismId: ORGANISM_ID },
      });
    });
  });

  describe("inline creation failures (issue #113)", () => {
    const newOrganism = {
      name: "Fondation OVE",
      structureType: "Secteur Associatif",
      city: "Lyon",
      postalCode: "69000",
      street: "1 rue de la République",
    };
    const newTutor = {
      firstName: "Karim",
      lastName: "Belkacem",
      email: "k.belkacem@example.org",
      jobTitle: "Directeur",
      acceptsPhoneContact: false,
    };

    it("reports a clear error and never creates the tutor or the stage when the new organism can't be created", async () => {
      prisma.hostOrganism.create.mockRejectedValue(new Error("db down"));

      const attempt = service.createDraft(
        USER_ID,
        basePayload({
          organism: { mode: "new", data: newOrganism },
          tutor: { mode: "new", data: newTutor },
        }),
      );

      await expect(attempt).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(attempt).rejects.toThrow(
        "Impossible de créer l'organisme. Le brouillon n'a pas été enregistré.",
      );
      expect(prisma.tutor.create).not.toHaveBeenCalled();
      expect(prisma.stage.create).not.toHaveBeenCalled();
    });

    it("reports a clear error and never creates the stage when the new tutor can't be created", async () => {
      prisma.hostOrganism.create.mockResolvedValue(organismRow());
      prisma.tutor.create.mockRejectedValue(new Error("db down"));

      const attempt = service.createDraft(
        USER_ID,
        basePayload({
          organism: { mode: "new", data: newOrganism },
          tutor: { mode: "new", data: newTutor },
        }),
      );

      await expect(attempt).rejects.toBeInstanceOf(InternalServerErrorException);
      await expect(attempt).rejects.toThrow(
        "Impossible de créer le tuteur. Le brouillon n'a pas été enregistré.",
      );
      expect(prisma.stage.create).not.toHaveBeenCalled();
    });
  });

  it("derives schoolYear/semester from the periods and persists mandatory exactly as given (no default leakage)", async () => {
    prisma.hostOrganism.findUnique.mockResolvedValue(organismRow());
    prisma.tutor.findFirst.mockResolvedValue(tutorRow());
    prisma.stage.create.mockResolvedValue(
      stageRow({ mandatory: false, semester: "S2", schoolYear: "2025-2026" }),
    );

    await service.createDraft(
      USER_ID,
      basePayload({
        mandatory: false,
        periods: [{ startDate: new Date("2026-02-01"), endDate: new Date("2026-02-15") }],
      }),
    );

    expect(prisma.stage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mandatory: false,
          semester: "S2",
          schoolYear: "2025-2026",
        }),
      }),
    );
  });
  describe("list: a student's own stage requests, filtered and sorted (issue #114)", () => {
    const periodRow = (id: string, start: string, end: string) => ({
      id,
      startDate: new Date(start),
      endDate: new Date(end),
    });
    const listRow = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      status: "DRAFT",
      schoolYear: "2025-2026",
      semester: "S1",
      mandatory: true,
      submittedAt: null,
      organism: { name: "Hôpital Cochin" },
      periods: [periodRow(`${id}-p`, "2025-10-01", "2025-10-15")],
      ...overrides,
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2025-09-19T12:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("only queries the caller's own stages, scoped by their student profile", async () => {
      prisma.stage.findMany.mockResolvedValue([]);

      await service.list(USER_ID, { sort: "startDate" });

      expect(prisma.stage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ studentId: PROFILE_ID }) }),
      );
    });

    it("throws NotFoundException when the caller has no student profile", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.list(USER_ID, { sort: "startDate" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("passes the status and semester filters to the query, and omits absent ones", async () => {
      prisma.stage.findMany.mockResolvedValue([]);

      await service.list(USER_ID, { status: "PENDING", semester: "S2", sort: "startDate" });
      expect(prisma.stage.findMany.mock.calls[0][0].where).toEqual({
        studentId: PROFILE_ID,
        status: "PENDING",
        semester: "S2",
      });

      await service.list(USER_ID, { sort: "startDate" });
      expect(prisma.stage.findMany.mock.calls[1][0].where).toEqual({ studentId: PROFILE_ID });
    });

    it("sorts by nearest upcoming start date: upcoming first ascending, then past, most recent first", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("past-old", { periods: [periodRow("a", "2025-01-10", "2025-01-20")] }),
        listRow("upcoming-far", { periods: [periodRow("b", "2026-03-01", "2026-03-10")] }),
        listRow("past-recent", { periods: [periodRow("c", "2025-06-01", "2025-06-10")] }),
        listRow("upcoming-near", { periods: [periodRow("d", "2025-10-01", "2025-10-10")] }),
      ]);

      const result = await service.list(USER_ID, { sort: "startDate" });

      expect(result.map((stage) => stage.id)).toEqual([
        "upcoming-near",
        "upcoming-far",
        "past-recent",
        "past-old",
      ]);
    });

    it("uses the earliest period's start when a stage has several periods", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("multi", {
          periods: [
            periodRow("p2", "2025-12-01", "2025-12-10"),
            periodRow("p1", "2025-10-05", "2025-10-10"),
          ],
        }),
        listRow("single", { periods: [periodRow("s", "2025-11-01", "2025-11-10")] }),
      ]);

      const result = await service.list(USER_ID, { sort: "startDate" });

      expect(result.map((stage) => stage.id)).toEqual(["multi", "single"]);
    });

    it("classes a stage as upcoming when any of its periods is still ahead, keyed on that nearest upcoming start", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("upcoming-later", { periods: [periodRow("a", "2025-11-20", "2025-11-25")] }),
        listRow("first-period-passed", {
          periods: [
            periodRow("b1", "2025-06-01", "2025-06-10"),
            periodRow("b2", "2025-10-05", "2025-10-10"),
          ],
        }),
        listRow("fully-past", { periods: [periodRow("c", "2025-03-01", "2025-03-10")] }),
      ]);

      const result = await service.list(USER_ID, { sort: "startDate" });

      expect(result.map((stage) => stage.id)).toEqual([
        "first-period-passed",
        "upcoming-later",
        "fully-past",
      ]);
    });

    it("treats a stage starting today (stored as UTC midnight) as upcoming, not past", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("past", { periods: [periodRow("a", "2025-09-01", "2025-09-10")] }),
        listRow("later", { periods: [periodRow("c", "2025-10-01", "2025-10-05")] }),
        listRow("today", { periods: [periodRow("b", "2025-09-19", "2025-09-30")] }),
      ]);

      const result = await service.list(USER_ID, { sort: "startDate" });

      expect(result.map((stage) => stage.id)).toEqual(["today", "later", "past"]);
    });

    it("does not break the sort on a stage with no periods: it goes last", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("empty", { periods: [] }),
        listRow("upcoming", { periods: [periodRow("a", "2025-10-01", "2025-10-05")] }),
        listRow("past", { periods: [periodRow("b", "2025-01-01", "2025-01-05")] }),
      ]);

      const result = await service.list(USER_ID, { sort: "startDate" });

      expect(result.map((stage) => stage.id)).toEqual(["upcoming", "past", "empty"]);
    });

    it("sorts by submission date via the database, never-submitted drafts last", async () => {
      prisma.stage.findMany.mockResolvedValue([listRow("a")]);

      await service.list(USER_ID, { sort: "submittedAt" });

      expect(prisma.stage.findMany.mock.calls[0][0].orderBy).toEqual([
        { submittedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ]);
    });

    it("shows the organism name for a live stage but never reads it for a frozen one (BR-08)", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("live", { status: "PENDING" }),
        listRow("frozen", { status: "VALIDATED" }),
      ]);

      const result = await service.list(USER_ID, { sort: "submittedAt" });

      expect(result.find((stage) => stage.id === "live")!.organismName).toBe("Hôpital Cochin");
      expect(result.find((stage) => stage.id === "frozen")!.organismName).toBeNull();
    });

    it("serialises dates as ISO strings", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("a", { submittedAt: new Date("2025-09-01T08:00:00Z") }),
      ]);

      const [item] = await service.list(USER_ID, { sort: "submittedAt" });

      expect(item!.submittedAt).toBe("2025-09-01T08:00:00.000Z");
      expect(item!.periods[0]!.startDate).toBe("2025-10-01T00:00:00.000Z");
    });
  });

  describe("getById: one stage request, live or frozen depending on its status (issue #114, ADR-0003)", () => {
    const referentRow = {
      referent: { id: "ref-1", user: { firstName: "Jean", lastName: "Valjean" } },
    };

    it("looks the stage up by id AND owner, so another student's stage is a 404, not a 403", async () => {
      prisma.stage.findFirst.mockResolvedValue(null);

      await expect(service.getById(USER_ID, "someone-elses")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.stage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "someone-elses", student: { userId: USER_ID } } }),
      );
    });

    it("assembles a DRAFT from live relations with the referent derived from the exact (year, semester, mandatory) tuple (BR-03)", async () => {
      prisma.stage.findFirst.mockResolvedValue(
        stageRow({ studentId: PROFILE_ID, submittedAt: null, refusalReason: null }),
      );
      prisma.referentAssignment.findUnique.mockResolvedValue(referentRow);

      const result = await service.getById(USER_ID, "stage-1");

      expect(prisma.referentAssignment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId_schoolYear_semester_mandatory: {
              studentId: PROFILE_ID,
              schoolYear: "2025-2026",
              semester: "S1",
              mandatory: true,
            },
          },
        }),
      );
      expect(result.referent).toEqual({ id: "ref-1", firstName: "Jean", lastName: "Valjean" });
      expect(result.organism.name).toBe("Hôpital Cochin");
    });

    it("returns a null referent when no assignment exists for the tuple (a referent for the other mandatory value does not count)", async () => {
      prisma.stage.findFirst.mockResolvedValue(
        stageRow({ studentId: PROFILE_ID, status: "PENDING", submittedAt: new Date("2025-09-01") }),
      );
      prisma.referentAssignment.findUnique.mockResolvedValue(null);

      const result = await service.getById(USER_ID, "stage-1");

      expect(result.referent).toBeNull();
      expect(result.submittedAt).toBe("2025-09-01T00:00:00.000Z");
    });

    it.each(["VALIDATED", "REFUSED"])(
      "does not assemble a %s stage from live relations: it is served from its snapshot, not implemented yet",
      async (status) => {
        prisma.stage.findFirst.mockResolvedValue(stageRow({ studentId: PROFILE_ID, status }));

        await expect(service.getById(USER_ID, "stage-1")).rejects.toBeInstanceOf(
          NotImplementedException,
        );
        expect(prisma.referentAssignment.findUnique).not.toHaveBeenCalled();
      },
    );
  });
  // Issue #115. The service reads the draft twice: once to gate it, then again
  // through getById() to answer with the fresh detail.
  describe("submit", () => {
    function draftForSubmit(overrides: Record<string, unknown> = {}) {
      return stageRow({
        studentId: PROFILE_ID,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Je souhaite découvrir le métier.",
        version: 3,
        student: { profileStatus: "VALID", user: { firstName: "Ada", lastName: "Lovelace" } },
        ...overrides,
      });
    }

    beforeEach(() => {
      prisma.stage.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findMany.mockResolvedValue([{ email: "admin@example.org" }]);
      prisma.referentAssignment.findUnique.mockResolvedValue(null);
    });

    function primeSuccess(draft = draftForSubmit()) {
      prisma.stage.findFirst.mockResolvedValueOnce(draft).mockResolvedValueOnce({
        ...draft,
        status: "PENDING",
        submittedAt: new Date("2025-09-05"),
      });
    }

    it("looks the stage up by id AND owner, so another student's stage is a 404", async () => {
      prisma.stage.findFirst.mockResolvedValue(null);

      await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "stage-1", student: { userId: USER_ID } } }),
      );
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
    });

    it.each(["PENDING", "VALIDATED", "REFUSED"])(
      "rejects a stage that is %s, not DRAFT, without touching it or emailing anyone",
      async (status) => {
        prisma.stage.findFirst.mockResolvedValue(draftForSubmit({ status }));

        await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it.each(["INCOMPLETE", "PENDING_VALIDATION", "EXPIRED"])(
      "BR-02: rejects submission with a %s profile and leaves the stage DRAFT",
      async (profileStatus) => {
        prisma.stage.findFirst.mockResolvedValue(
          draftForSubmit({ student: { profileStatus, user: { firstName: "Ada", lastName: "L" } } }),
        );

        await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["organism", { organism: null, organismId: null }, /organisme/i],
      ["tutor", { tutor: null, tutorId: null }, /tuteur/i],
      ["service", { service: null }, /service/i],
      ["project type", { projectType: null }, /handicap/i],
      ["motivation", { motivation: null }, /motivation/i],
      ["period", { periods: [] }, /période/i],
    ])(
      "submission-completeness: rejects a draft missing its %s and says which one",
      async (_field, overrides, reason) => {
        prisma.stage.findFirst.mockResolvedValue(draftForSubmit(overrides));

        const error = await service.submit(USER_ID, "stage-1").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(JSON.stringify((error as BadRequestException).getResponse())).toMatch(reason);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it("moves a complete DRAFT to PENDING, sets submittedAt, and returns the fresh detail", async () => {
      primeSuccess();

      const result = await service.submit(USER_ID, "stage-1");

      expect(prisma.stage.updateMany).toHaveBeenCalledWith({
        where: { id: "stage-1", status: "DRAFT", version: 3 },
        data: { status: "PENDING", submittedAt: expect.any(Date), version: { increment: 1 } },
      });
      expect(result.status).toBe("PENDING");
      expect(result.submittedAt).toBe("2025-09-05T00:00:00.000Z");
    });

    it("BR-09: answers 409 and emails nobody when the stage changed since it was read (0 rows updated)", async () => {
      prisma.stage.findFirst.mockResolvedValue(draftForSubmit());
      prisma.stage.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(ConflictException);
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });

    it("BR-07: emails every ADMIN with the student's name and the organism", async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: "admin1@example.org" },
        { email: "admin2@example.org" },
      ]);
      primeSuccess();

      await service.submit(USER_ID, "stage-1");

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roles: { has: "ADMIN" } } }),
      );
      expect(mailerService.sendSafely).toHaveBeenCalledTimes(2);
      const first = mailerService.sendSafely.mock.calls[0][0];
      expect(first.to).toEqual({ email: "admin1@example.org" });
      expect(first.text).toContain("Ada Lovelace");
      expect(first.text).toContain("Hôpital Cochin");
      expect(mailerService.sendSafely.mock.calls[1][0].to).toEqual({ email: "admin2@example.org" });
    });

    it("BR-07: still succeeds, the transition being committed, when the admin lookup itself fails", async () => {
      prisma.user.findMany.mockRejectedValue(new Error("connection reset"));
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
    });

    it("BR-07: still succeeds when there is no admin to notify", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });
  });
});
