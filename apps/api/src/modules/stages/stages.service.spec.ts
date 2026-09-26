import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateStageDraftRequest, UpdateStageDraftRequest } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { snapshotV1 } from "../../../test/helpers/stage-snapshot";
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
    version: 0,
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
    hostOrganism: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    tutor: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    stage: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    stagePeriod: { deleteMany: jest.Mock; createMany: jest.Mock };
    user: { findMany: jest.Mock };
    referentAssignment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailerService: { sendSafely: jest.Mock };

  beforeEach(async () => {
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      hostOrganism: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      tutor: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      stage: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        // 0 = no other referencing stage, i.e. the organism/tutor is unfrozen.
        count: jest.fn().mockResolvedValue(0),
      },
      stagePeriod: { deleteMany: jest.fn(), createMany: jest.fn() },
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

  // Undoes the Logger spies even when an assertion fails before the end of a test.
  afterEach(() => jest.restoreAllMocks());

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

    it("BR-08: reads a live stage from its live rows and a decided one from its snapshot", async () => {
      prisma.stage.findMany.mockResolvedValue([
        listRow("live", { status: "PENDING" }),
        // The live rows were edited after the decision: the list must not follow.
        listRow("frozen", {
          status: "VALIDATED",
          organism: { name: "Renommé depuis la validation" },
          periods: [periodRow("live-p", "2026-03-01", "2026-03-15")],
          snapshotVersion: 1,
          snapshot: snapshotV1({ schoolYear: "2024-2025", semester: "S2", mandatory: false }),
        }),
      ]);

      const result = await service.list(USER_ID, { sort: "submittedAt" });

      expect(result.find((stage) => stage.id === "live")!.organismName).toBe("Hôpital Cochin");
      expect(result.find((stage) => stage.id === "frozen")).toMatchObject({
        organismName: "Hôpital Cochin",
        schoolYear: "2024-2025",
        semester: "S2",
        mandatory: false,
        periods: [{ id: "p1", startDate: "2025-10-01T00:00:00.000Z" }],
      });
    });

    it("BR-08: lists a decided stage whose snapshot is unreadable without its organism or periods, logs it, and keeps the other rows", async () => {
      const logError = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      prisma.stage.findMany.mockResolvedValue([
        listRow("live", { status: "PENDING" }),
        listRow("broken", { status: "REFUSED", snapshotVersion: null, snapshot: null }),
      ]);

      const result = await service.list(USER_ID, { sort: "submittedAt" });

      expect(result.map((stage) => stage.id)).toEqual(["live", "broken"]);
      // No fallback to the live organism or periods.
      expect(result[1]).toMatchObject({ organismName: null, periods: [] });
      expect(logError).toHaveBeenCalledWith(expect.stringContaining("broken"), expect.anything());
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
      // Only a decided stage has a decision date.
      expect(result.decidedAt).toBeNull();
    });

    describe("BR-08: a decided stage is served from its frozen snapshot", () => {
      // The live rows were edited after the decision, and the referent was
      // reassigned: none of it may reach the response.
      const decidedRow = (overrides: Record<string, unknown> = {}) =>
        stageRow({
          studentId: PROFILE_ID,
          status: "VALIDATED",
          version: 3,
          organism: organismRow({ name: "Renommé depuis la validation" }),
          tutor: tutorRow({ lastName: "Renommée" }),
          submittedAt: new Date("2025-09-01T08:00:00Z"),
          refusalReason: null,
          snapshotVersion: 1,
          snapshot: snapshotV1(),
          ...overrides,
        });

      it("BR-08: returns the snapshot in the live detail shape, read-only, never the live relations", async () => {
        prisma.stage.findFirst.mockResolvedValue(decidedRow());
        prisma.referentAssignment.findUnique.mockResolvedValue({
          referent: { id: "ref-2", user: { firstName: "Autre", lastName: "Référent" } },
        });

        const result = await service.getById(USER_ID, "stage-1");

        expect(result).toEqual({
          id: "stage-1",
          status: "VALIDATED",
          version: 3,
          schoolYear: "2025-2026",
          semester: "S1",
          mandatory: true,
          service: "Cardiologie",
          projectType: "Handicap moteur",
          motivation: "Découvrir le milieu hospitalier",
          organism: { ...snapshotV1().organism, editable: false },
          tutor: { ...snapshotV1().tutor, editable: false },
          periods: snapshotV1().periods,
          referent: { id: "ref-1", firstName: "Jean", lastName: "Valjean" },
          submittedAt: "2025-09-01T08:00:00.000Z",
          decidedAt: "2025-09-10T09:30:00.000Z",
          refusalReason: null,
        });
        // The referent is the frozen one, not re-derived from the assignment.
        expect(prisma.referentAssignment.findUnique).not.toHaveBeenCalled();
      });

      it("BR-08: does not expose the deciding admin or the student's promotion", async () => {
        prisma.stage.findFirst.mockResolvedValue(decidedRow());

        const result = await service.getById(USER_ID, "stage-1");

        expect(result).not.toHaveProperty("decidedBy");
        expect(result).not.toHaveProperty("promotion");
      });

      it("BR-08: carries a REFUSED stage's refusal reason from its live column", async () => {
        prisma.stage.findFirst.mockResolvedValue(
          decidedRow({ status: "REFUSED", refusalReason: "Dates incompatibles" }),
        );

        const result = await service.getById(USER_ID, "stage-1");

        expect(result).toMatchObject({ status: "REFUSED", refusalReason: "Dates incompatibles" });
      });

      it.each([
        ["missing", { snapshotVersion: null, snapshot: null }],
        ["of an unknown version", { snapshotVersion: 99, snapshot: snapshotV1() }],
        ["unparseable", { snapshotVersion: 1, snapshot: { schoolYear: "not a year" } }],
      ])(
        "BR-08: answers 500, never the live rows, when the snapshot is %s",
        async (_case, overrides) => {
          const logError = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => undefined);
          prisma.stage.findFirst.mockResolvedValue(decidedRow(overrides));

          await expect(service.getById(USER_ID, "stage-1")).rejects.toBeInstanceOf(
            InternalServerErrorException,
          );
          expect(logError).toHaveBeenCalledWith(
            expect.stringContaining("stage-1"),
            expect.anything(),
          );
        },
      );
    });
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

    // The fixture periods are in October 2025: freeze only Date inside that
    // school year so the previous-year rule doesn't depend on the real clock.
    function freezeToday(isoDate: string) {
      jest.useFakeTimers({
        now: new Date(isoDate),
        doNotFake: [
          "nextTick",
          "setImmediate",
          "clearImmediate",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "queueMicrotask",
          "hrtime",
          "performance",
        ],
      });
    }

    afterEach(() => jest.useRealTimers());

    beforeEach(() => {
      freezeToday("2025-11-01T10:00:00.000Z");
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

    it("BR-01: rejects a draft whose periods are in the previous school year, leaving it DRAFT", async () => {
      freezeToday("2026-09-20T10:00:00.000Z");
      prisma.stage.findFirst.mockResolvedValue(draftForSubmit());

      const error = await service.submit(USER_ID, "stage-1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).toMatch(
        /année scolaire précédente/,
      );
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });

    it("allows submitting a draft whose period already started, within the current school year (a posteriori request)", async () => {
      freezeToday("2026-02-01T10:00:00.000Z");
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
    });

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

  describe("updateDraft (issue #116)", () => {
    const ORGANISM_2_ID = "33333333-3333-3333-3333-333333333333";
    const TUTOR_2_ID = "44444444-4444-4444-4444-444444444444";

    function draft(overrides: Record<string, unknown> = {}) {
      return stageRow({
        studentId: PROFILE_ID,
        organismId: ORGANISM_ID,
        tutorId: TUTOR_ID,
        version: 2,
        submittedAt: null,
        refusalReason: null,
        ...overrides,
      });
    }

    function updatePayload(overrides: Record<string, unknown> = {}) {
      return {
        version: 2,
        organism: { mode: "existing", id: ORGANISM_ID },
        tutor: { mode: "existing", id: TUTOR_ID },
        periods: [{ startDate: new Date("2025-10-01"), endDate: new Date("2025-10-15") }],
        mandatory: true,
        ...overrides,
      } as UpdateStageDraftRequest;
    }

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

    beforeEach(() => {
      prisma.stage.updateMany.mockResolvedValue({ count: 1 });
      prisma.referentAssignment.findUnique.mockResolvedValue(null);
      prisma.hostOrganism.findUnique.mockResolvedValue(organismRow());
      prisma.tutor.findFirst.mockResolvedValue(tutorRow());
      // First read: the stage as loaded for the write. Second: the fresh detail.
      prisma.stage.findFirst.mockResolvedValue(draft());
    });

    it("looks the stage up by id AND owner, so another student's stage is a 404", async () => {
      prisma.stage.findFirst.mockReset().mockResolvedValue(null);

      await expect(
        service.updateDraft(USER_ID, "someone-elses", updatePayload()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "someone-elses", student: { userId: USER_ID } } }),
      );
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
    });

    it.each(["PENDING", "VALIDATED", "REFUSED"])(
      "rejects editing a %s stage: only a DRAFT can be edited",
      async (status) => {
        prisma.stage.findFirst.mockReset().mockResolvedValue(draft({ status }));

        await expect(
          service.updateDraft(USER_ID, "stage-1", updatePayload()),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
      },
    );

    describe("BR-09: optimistic locking", () => {
      it("rejects a stale version with a conflict, before touching anything", async () => {
        await expect(
          service.updateDraft(USER_ID, "stage-1", updatePayload({ version: 1 })),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: "STAGE_VERSION_CONFLICT" }),
        });
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(prisma.stagePeriod.deleteMany).not.toHaveBeenCalled();
      });

      it("writes conditionally on the version it was given and bumps it", async () => {
        await service.updateDraft(USER_ID, "stage-1", updatePayload());

        expect(prisma.stage.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "stage-1", status: "DRAFT", version: 2 },
            data: expect.objectContaining({ version: { increment: 1 } }),
          }),
        );
      });

      it("rejects with a conflict, and replaces no period, when a concurrent write wins the race (0 rows updated)", async () => {
        prisma.stage.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.updateDraft(USER_ID, "stage-1", updatePayload()),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: "STAGE_VERSION_CONFLICT" }),
        });
        expect(prisma.stagePeriod.deleteMany).not.toHaveBeenCalled();
        expect(prisma.stagePeriod.createMany).not.toHaveBeenCalled();
      });
    });

    describe("BR-04b: semester and school year are re-derived from the periods", () => {
      it("derives S2 and the new school year when the periods move", async () => {
        await service.updateDraft(
          USER_ID,
          "stage-1",
          updatePayload({
            periods: [{ startDate: new Date("2026-03-02"), endDate: new Date("2026-03-13") }],
          }),
        );

        expect(prisma.stage.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ semester: "S2", schoolYear: "2025-2026" }),
          }),
        );
      });

      it("ignores a client-supplied semester", async () => {
        await service.updateDraft(
          USER_ID,
          "stage-1",
          updatePayload({ semester: "S2" } as Record<string, unknown>),
        );

        expect(prisma.stage.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ semester: "S1" }) }),
        );
      });

      it("replaces the stage's periods with the submitted ones", async () => {
        await service.updateDraft(USER_ID, "stage-1", updatePayload());

        expect(prisma.stagePeriod.deleteMany).toHaveBeenCalledWith({
          where: { stageId: "stage-1" },
        });
        expect(prisma.stagePeriod.createMany).toHaveBeenCalledWith({
          data: [
            {
              stageId: "stage-1",
              startDate: new Date("2025-10-01"),
              endDate: new Date("2025-10-15"),
            },
          ],
        });
      });
    });

    it("clears an optional text field the student emptied, and never touches the referent", async () => {
      prisma.stage.findFirst.mockReset().mockResolvedValue(draft({ service: "Cardiologie" }));

      await service.updateDraft(USER_ID, "stage-1", updatePayload({ service: undefined }));

      expect(prisma.stage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ service: null, projectType: null, motivation: null }),
        }),
      );
      expect(prisma.stage.updateMany.mock.calls[0]![0].data).not.toHaveProperty("referentId");
    });

    describe("organism: existing / new / edit", () => {
      it("points the draft at another existing organism without writing to any organism row", async () => {
        prisma.hostOrganism.findUnique.mockResolvedValue(organismRow({ id: ORGANISM_2_ID }));
        prisma.tutor.findFirst.mockResolvedValue(
          tutorRow({ id: TUTOR_2_ID, organismId: ORGANISM_2_ID }),
        );

        await service.updateDraft(
          USER_ID,
          "stage-1",
          updatePayload({
            organism: { mode: "existing", id: ORGANISM_2_ID },
            tutor: { mode: "existing", id: TUTOR_2_ID },
          }),
        );

        expect(prisma.hostOrganism.update).not.toHaveBeenCalled();
        expect(prisma.stage.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ organismId: ORGANISM_2_ID, tutorId: TUTOR_2_ID }),
          }),
        );
      });

      it("creates a new organism and tutor inline", async () => {
        prisma.hostOrganism.create.mockResolvedValue(organismRow({ id: ORGANISM_2_ID }));
        prisma.tutor.create.mockResolvedValue(tutorRow({ id: TUTOR_2_ID }));

        await service.updateDraft(
          USER_ID,
          "stage-1",
          updatePayload({
            organism: { mode: "new", data: organismData },
            tutor: { mode: "new", data: tutorData },
          }),
        );

        expect(prisma.hostOrganism.create).toHaveBeenCalledWith({ data: organismData });
        expect(prisma.tutor.create).toHaveBeenCalledWith({
          data: { ...tutorData, organismId: ORGANISM_2_ID },
        });
      });

      it("rejects an existing organism id that doesn't exist", async () => {
        prisma.hostOrganism.findUnique.mockResolvedValue(null);

        await expect(
          service.updateDraft(USER_ID, "stage-1", updatePayload()),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("rejects a tutor that doesn't belong to the resolved organism", async () => {
        prisma.tutor.findFirst.mockResolvedValue(null);

        await expect(
          service.updateDraft(USER_ID, "stage-1", updatePayload()),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
      });
    });

    describe("freeze: an organism/tutor row is editable only while referenced by this student's own DRAFT stages", () => {
      const editOrganism = () =>
        updatePayload({ organism: { mode: "edit", id: ORGANISM_ID, data: organismData } });
      const editTutor = () =>
        updatePayload({ tutor: { mode: "edit", id: TUTOR_ID, data: tutorData } });

      it("edits the organism in place when nothing but this student's drafts references it", async () => {
        prisma.stage.count.mockResolvedValue(0);
        prisma.hostOrganism.update.mockResolvedValue(organismRow(organismData));

        await service.updateDraft(USER_ID, "stage-1", editOrganism());

        expect(prisma.hostOrganism.update).toHaveBeenCalledWith({
          where: { id: ORGANISM_ID },
          data: organismData,
        });
      });

      it("asks whether any stage that is not this student's DRAFT references the organism", async () => {
        prisma.hostOrganism.update.mockResolvedValue(organismRow(organismData));

        await service.updateDraft(USER_ID, "stage-1", editOrganism());

        expect(prisma.stage.count).toHaveBeenCalledWith({
          where: { organismId: ORGANISM_ID, NOT: { status: "DRAFT", studentId: PROFILE_ID } },
        });
      });

      it("rejects an organism edit once a second student's DRAFT (or a non-DRAFT stage) references it", async () => {
        prisma.stage.count.mockResolvedValue(1);

        await expect(service.updateDraft(USER_ID, "stage-1", editOrganism())).rejects.toMatchObject(
          {
            response: expect.objectContaining({ code: "STAGE_ROW_FROZEN" }),
          },
        );
        expect(prisma.hostOrganism.update).not.toHaveBeenCalled();
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
      });

      it("edits the tutor in place when it is unfrozen", async () => {
        prisma.tutor.update.mockResolvedValue(tutorRow(tutorData));

        await service.updateDraft(USER_ID, "stage-1", editTutor());

        expect(prisma.stage.count).toHaveBeenCalledWith({
          where: { tutorId: TUTOR_ID, NOT: { status: "DRAFT", studentId: PROFILE_ID } },
        });
        expect(prisma.tutor.update).toHaveBeenCalledWith({
          where: { id: TUTOR_ID },
          data: tutorData,
        });
      });

      it("rejects a tutor edit once the tutor is frozen", async () => {
        prisma.stage.count.mockResolvedValue(2);

        await expect(service.updateDraft(USER_ID, "stage-1", editTutor())).rejects.toMatchObject({
          response: expect.objectContaining({ code: "STAGE_ROW_FROZEN" }),
        });
        expect(prisma.tutor.update).not.toHaveBeenCalled();
      });

      it("only lets the student edit the organism/tutor their own draft points to", async () => {
        await expect(
          service.updateDraft(
            USER_ID,
            "stage-1",
            updatePayload({ organism: { mode: "edit", id: ORGANISM_2_ID, data: organismData } }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.hostOrganism.update).not.toHaveBeenCalled();
      });

      it("still lets a student add a brand-new tutor to a frozen organism", async () => {
        prisma.stage.count.mockResolvedValue(3); // the organism is frozen
        prisma.tutor.create.mockResolvedValue(tutorRow({ id: TUTOR_2_ID }));

        await service.updateDraft(
          USER_ID,
          "stage-1",
          updatePayload({ tutor: { mode: "new", data: tutorData } }),
        );

        expect(prisma.tutor.create).toHaveBeenCalledWith({
          data: { ...tutorData, organismId: ORGANISM_ID },
        });
      });

      it("rolls the whole write back (throws inside the transaction) when the row turns out frozen", async () => {
        prisma.stage.count.mockResolvedValue(1);

        await expect(service.updateDraft(USER_ID, "stage-1", editOrganism())).rejects.toBeDefined();
        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe("editable flags on the response", () => {
      it("flags organism and tutor editable while unfrozen, on a DRAFT", async () => {
        prisma.stage.count.mockResolvedValue(0);

        const result = await service.updateDraft(USER_ID, "stage-1", updatePayload());

        expect(result.version).toBe(2);
        expect(result.organism.editable).toBe(true);
        expect(result.tutor.editable).toBe(true);
      });

      it("flags them not editable once another stage references them", async () => {
        prisma.stage.count.mockResolvedValue(1);

        const result = await service.updateDraft(USER_ID, "stage-1", updatePayload());

        expect(result.organism.editable).toBe(false);
        expect(result.tutor.editable).toBe(false);
      });
    });
  });

  describe("duplicate stage (issue #117)", () => {
    const SOURCE_PERIODS = [
      { id: "period-a", startDate: new Date("2025-10-01"), endDate: new Date("2025-10-15") },
      { id: "period-b", startDate: new Date("2025-11-03"), endDate: new Date("2025-11-14") },
    ];

    function source(overrides: Record<string, unknown> = {}) {
      return stageRow({
        id: "source-1",
        studentId: PROFILE_ID,
        organismId: ORGANISM_ID,
        tutorId: TUTOR_ID,
        version: 7,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Découvrir le milieu hospitalier",
        periods: SOURCE_PERIODS,
        ...overrides,
      });
    }

    beforeEach(() => {
      prisma.stage.findFirst.mockResolvedValue(source());
      prisma.stage.create.mockImplementation(({ data }) =>
        Promise.resolve(
          stageRow({
            id: "copy-1",
            studentId: PROFILE_ID,
            organismId: data.organismId,
            tutorId: data.tutorId,
            status: data.status,
            semester: data.semester,
            schoolYear: data.schoolYear,
            mandatory: data.mandatory,
            service: data.service,
            projectType: data.projectType,
            motivation: data.motivation,
            periods: SOURCE_PERIODS.map((period, index) => ({ ...period, id: `copy-${index}` })),
          }),
        ),
      );
    });

    it("creates a DRAFT carrying over every field and each period, linked to the source by parentStageId", async () => {
      await service.duplicate(USER_ID, "source-1");

      expect(prisma.stage.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.stage.create.mock.calls[0][0];
      expect(data).toMatchObject({
        status: "DRAFT",
        studentId: PROFILE_ID,
        parentStageId: "source-1",
        organismId: ORGANISM_ID,
        tutorId: TUTOR_ID,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Découvrir le milieu hospitalier",
        mandatory: true,
        schoolYear: "2025-2026",
      });
      // Periods are re-created as new rows: the source's ids must not leak.
      expect(data.periods.create).toEqual([
        { startDate: SOURCE_PERIODS[0]!.startDate, endDate: SOURCE_PERIODS[0]!.endDate },
        { startDate: SOURCE_PERIODS[1]!.startDate, endDate: SOURCE_PERIODS[1]!.endDate },
      ]);
    });

    it("BR-04b: re-derives the semester from the copied periods instead of trusting the stored one", async () => {
      // October periods are S1; the stored S2 stands for a stale row.
      prisma.stage.findFirst.mockResolvedValue(source({ semester: "S2" }));

      await service.duplicate(USER_ID, "source-1");

      expect(prisma.stage.create.mock.calls[0][0].data.semester).toBe("S1");
    });

    // Duplication never checks dates against today: it copies the periods as
    // they are, and the student corrects them in the new draft. Whether the
    // copy can then be submitted is the submission gate's call (BR-02 +
    // previous-year rule in getSubmissionBlockers), not duplicate's.
    describe("BR-01 / BR-04b: sources dated outside the current school year", () => {
      afterEach(() => jest.useRealTimers());

      it("copies a stage from last school year as is: its periods, its past school year and its re-derived semester", async () => {
        jest.useFakeTimers({
          now: new Date("2026-09-26T10:00:00.000Z"),
          doNotFake: ["nextTick", "setImmediate"],
        });
        const lastYear = [
          { id: "period-a", startDate: new Date("2026-02-02"), endDate: new Date("2026-03-13") },
        ];
        prisma.stage.findFirst.mockResolvedValue(
          source({ status: "REFUSED", schoolYear: "2025-2026", semester: "S2", periods: lastYear }),
        );

        await service.duplicate(USER_ID, "source-1");

        const { data } = prisma.stage.create.mock.calls[0][0];
        expect(data).toMatchObject({ status: "DRAFT", schoolYear: "2025-2026", semester: "S2" });
        expect(data.periods.create).toEqual([
          { startDate: lastYear[0]!.startDate, endDate: lastYear[0]!.endDate },
        ]);
      });

      it.each([
        { label: "S1", start: "2027-10-04", end: "2027-10-29", semester: "S1" },
        { label: "S2", start: "2028-03-06", end: "2028-04-14", semester: "S2" },
        {
          label: "last day before the next school year",
          start: "2028-08-01",
          end: "2028-08-31T23:59:59.999Z",
          semester: "S2",
        },
      ])(
        "copies a draft dated after September 2027 ($label) as is, in its future school year",
        async ({ start, end, semester }) => {
          const future = [{ id: "period-a", startDate: new Date(start), endDate: new Date(end) }];
          prisma.stage.findFirst.mockResolvedValue(
            source({ status: "DRAFT", schoolYear: "2027-2028", semester, periods: future }),
          );

          await service.duplicate(USER_ID, "source-1");

          const { data } = prisma.stage.create.mock.calls[0][0];
          expect(data).toMatchObject({ status: "DRAFT", schoolYear: "2027-2028", semester });
          expect(data.periods.create).toEqual([
            { startDate: future[0]!.startDate, endDate: future[0]!.endDate },
          ]);
        },
      );
    });

    it.each(["DRAFT", "PENDING", "VALIDATED", "REFUSED"])(
      "succeeds from a %s source",
      async (status) => {
        prisma.stage.findFirst.mockResolvedValue(source({ status }));

        const result = await service.duplicate(USER_ID, "source-1");

        expect(result.id).toBe("copy-1");
        expect(result.status).toBe("DRAFT");
      },
    );

    it("never copies the submission date, refusal reason, decision date, snapshot, snapshot version or version", async () => {
      prisma.stage.findFirst.mockResolvedValue(
        source({
          status: "REFUSED",
          submittedAt: new Date("2025-09-01"),
          refusalReason: "Dates incompatibles",
          decidedAt: new Date("2025-09-20"),
          snapshot: { organism: { name: "Hôpital Cochin" } },
          snapshotVersion: 1,
        }),
      );

      await service.duplicate(USER_ID, "source-1");

      const { data } = prisma.stage.create.mock.calls[0][0];
      for (const field of [
        "submittedAt",
        "refusalReason",
        "decidedAt",
        "snapshot",
        "snapshotVersion",
        "version",
      ]) {
        expect(data).not.toHaveProperty(field);
      }
    });

    it("looks the source up by id and owner, so another student's stage is a 404 and nothing is created", async () => {
      prisma.stage.findFirst.mockResolvedValue(null);

      await expect(service.duplicate(USER_ID, "someone-elses")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.stage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "someone-elses", student: { userId: USER_ID } },
        }),
      );
      expect(prisma.stage.create).not.toHaveBeenCalled();
    });

    it("returns the new draft in the same shape as a created draft", async () => {
      const result = await service.duplicate(USER_ID, "source-1");

      expect(result).toMatchObject({
        id: "copy-1",
        status: "DRAFT",
        version: 0,
        service: "Cardiologie",
        organism: { id: ORGANISM_ID, editable: true },
        tutor: { id: TUTOR_ID, editable: true },
      });
      expect(result.periods).toHaveLength(2);
    });
  });
});
