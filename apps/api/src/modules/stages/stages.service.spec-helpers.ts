import { Test } from "@nestjs/testing";
import type { CreateStageDraftRequest } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import { StagesService } from "./stages.service";

// Shared by the stages.service.*.spec.ts files, split by service method. Not a
// spec itself (no test in it), and excluded from the production build.

export const USER_ID = "user-1";
export const PROFILE_ID = "profile-1";
export const ORGANISM_ID = "11111111-1111-1111-1111-111111111111";
export const TUTOR_ID = "22222222-2222-2222-2222-222222222222";

export function basePayload(
  overrides: Partial<CreateStageDraftRequest> = {},
): CreateStageDraftRequest {
  return {
    organism: { mode: "existing", id: ORGANISM_ID },
    tutor: { mode: "existing", id: TUTOR_ID },
    periods: [{ startDate: new Date("2025-10-01"), endDate: new Date("2025-10-15") }],
    mandatory: true,
    ...overrides,
  } as CreateStageDraftRequest;
}

export function organismRow(overrides: Record<string, unknown> = {}) {
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

export function tutorRow(overrides: Record<string, unknown> = {}) {
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

export function stageRow(overrides: Record<string, unknown> = {}) {
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

export type PrismaMock = {
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

export type MailerServiceMock = { sendSafely: jest.Mock };

// A fresh StagesService over fresh mocks, for each test's beforeEach. The
// caller is a student with a profile by default.
export async function createStagesServiceTestBed(): Promise<{
  service: StagesService;
  prisma: PrismaMock;
  mailerService: MailerServiceMock;
}> {
  const prisma: PrismaMock = {
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
  const mailerService: MailerServiceMock = { sendSafely: jest.fn().mockResolvedValue(undefined) };

  const module = await Test.createTestingModule({
    providers: [
      StagesService,
      { provide: PrismaService, useValue: prisma },
      { provide: MailerService, useValue: mailerService },
    ],
  }).compile();

  return { service: module.get(StagesService), prisma, mailerService };
}
