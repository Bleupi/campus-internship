import { InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { snapshotV1 } from "../../../test/helpers/stage-snapshot";
import type { StagesService } from "./stages.service";
import {
  PROFILE_ID,
  USER_ID,
  createStagesServiceTestBed,
  organismRow,
  stageRow,
  tutorRow,
  type PrismaMock,
} from "./stages.service.spec-helpers";

describe("StagesService", () => {
  let service: StagesService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    ({ service, prisma } = await createStagesServiceTestBed());
  });

  // Undoes the Logger spies even when an assertion fails before the end of a test.
  afterEach(() => jest.restoreAllMocks());

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
});
