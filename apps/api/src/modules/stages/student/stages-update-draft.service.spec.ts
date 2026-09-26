import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { UpdateStageDraftRequest } from "shared";
import type { StagesService } from "./stages.service";
import {
  ORGANISM_ID,
  PROFILE_ID,
  TUTOR_ID,
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
});
