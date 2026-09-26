import { NotFoundException } from "@nestjs/common";
import type { StagesService } from "./stages.service";
import {
  ORGANISM_ID,
  PROFILE_ID,
  TUTOR_ID,
  USER_ID,
  createStagesServiceTestBed,
  stageRow,
  type PrismaMock,
} from "./stages.service.spec-helpers";

describe("StagesService", () => {
  let service: StagesService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    ({ service, prisma } = await createStagesServiceTestBed());
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
