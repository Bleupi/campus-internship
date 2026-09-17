import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateStageDraftRequest } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
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
    structureType: "Hôpital",
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
    stage: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      hostOrganism: { findUnique: jest.fn(), create: jest.fn() },
      tutor: { findFirst: jest.fn(), create: jest.fn() },
      stage: { create: jest.fn() },
      $transaction: jest.fn((arg) => arg(prisma)),
    };
    prisma.studentProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, userId: USER_ID });

    const module = await Test.createTestingModule({
      providers: [StagesService, { provide: PrismaService, useValue: prisma }],
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
        structureType: "Association",
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
