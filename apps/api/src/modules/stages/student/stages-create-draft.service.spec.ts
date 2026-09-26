import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { StagesService } from "./stages.service";
import {
  ORGANISM_ID,
  PROFILE_ID,
  TUTOR_ID,
  USER_ID,
  basePayload,
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
});
