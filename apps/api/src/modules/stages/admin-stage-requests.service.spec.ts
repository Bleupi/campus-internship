import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import { AdminStageRequestsService } from "./admin-stage-requests.service";

const STAGE_ID = "stage-1";
const ADMIN = { id: "admin-1", firstName: "Jean", lastName: "Martin" };
const UNIVERSITY_EMAIL = "etudiant@etu.u-paris.fr";
const PERSONAL_EMAIL = "perso@example.com";

function organism(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    name: "Hôpital Cochin",
    structureType: "Secteur Sanitaire",
    street: "27 Rue du Faubourg Saint-Jacques",
    postalCode: "75014",
    city: "Paris",
    ...overrides,
  };
}

function tutor(overrides: Record<string, unknown> = {}) {
  return {
    id: "tut-1",
    firstName: "Marie",
    lastName: "Curie",
    email: "m.curie@example.org",
    jobTitle: "Médecin",
    phone: null,
    acceptsPhoneContact: false,
    ...overrides,
  };
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    promotion: "L2",
    personalEmail: null,
    user: { firstName: "Étu", lastName: "Dupont", email: UNIVERSITY_EMAIL },
    ...overrides,
  };
}

function stageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STAGE_ID,
    status: "PENDING",
    version: 0,
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    service: "Cardiologie",
    projectType: "Handicap moteur",
    motivation: "Motivation détaillée.",
    submittedAt: new Date("2025-09-01T09:00:00.000Z"),
    studentId: "profile-1",
    organism: organism(),
    tutor: tutor(),
    student: student(),
    periods: [
      { id: "period-1", startDate: new Date("2025-10-01"), endDate: new Date("2025-10-15") },
    ],
    ...overrides,
  };
}

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    referent: {
      id: "referent-1",
      user: { firstName: "Réf", lastName: "Erent" },
    },
    ...overrides,
  };
}

describe("AdminStageRequestsService.refuse — issue #151", () => {
  let service: AdminStageRequestsService;
  let prisma: {
    stage: { findUnique: jest.Mock; updateMany: jest.Mock };
    referentAssignment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailerService: { sendSafely: jest.Mock };

  beforeEach(async () => {
    prisma = {
      stage: {
        findUnique: jest.fn().mockResolvedValue(stageRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      referentAssignment: { findUnique: jest.fn().mockResolvedValue(assignmentRow()) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    mailerService = { sendSafely: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AdminStageRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get(AdminStageRequestsService);
  });

  it("404s when the stage does not exist", async () => {
    prisma.stage.findUnique.mockResolvedValue(null);

    await expect(
      service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.stage.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "VALIDATED", "REFUSED"])(
    "rejects with a conflict when the stage is %s, not PENDING",
    async (status) => {
      prisma.stage.findUnique.mockResolvedValue(stageRow({ status }));

      await expect(
        service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "STAGE_NOT_PENDING" }) });
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
    },
  );

  it("BR-03: rejects with a conflict when no referent is assigned for the stage's exact tuple", async () => {
    prisma.referentAssignment.findUnique.mockResolvedValue(null);

    await expect(
      service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "STAGE_NO_REFERENT" }) });
    expect(prisma.stage.updateMany).not.toHaveBeenCalled();
  });

  it("BR-03: looks up the referent by the stage's exact (student, schoolYear, semester, mandatory) tuple", async () => {
    await service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN);

    expect(prisma.referentAssignment.findUnique).toHaveBeenCalledWith({
      where: {
        studentId_schoolYear_semester_mandatory: {
          studentId: "profile-1",
          schoolYear: "2025-2026",
          semester: "S1",
          mandatory: true,
        },
      },
      include: { referent: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
  });

  describe("BR-09: optimistic locking", () => {
    it("writes conditionally on the version it was given, and bumps it", async () => {
      await service.refuse(STAGE_ID, { version: 3, reason: "Motif" }, ADMIN);

      expect(prisma.stage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: STAGE_ID, status: "PENDING", version: 3 },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
    });

    it("rejects with a version-conflict code when the write matches zero rows (stale version)", async () => {
      prisma.stage.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "STAGE_VERSION_CONFLICT" }),
      });
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });
  });

  describe("BR-08: snapshot construction (ADR-0033)", () => {
    it("freezes a snapshot with the non-null referent and the student's promotion at decision time", async () => {
      await service.refuse(STAGE_ID, { version: 0, reason: "Adresse incomplète" }, ADMIN);

      const { data } = prisma.stage.updateMany.mock.calls[0][0];
      expect(data.status).toBe("REFUSED");
      expect(data.refusalReason).toBe("Adresse incomplète");
      expect(data.snapshotVersion).toBe(1);
      expect(data.decidedAt).toBeInstanceOf(Date);
      expect(data.snapshot).toEqual({
        organism: organism(),
        tutor: tutor(),
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Motivation détaillée.",
        schoolYear: "2025-2026",
        semester: "S1",
        mandatory: true,
        periods: [
          {
            id: "period-1",
            startDate: "2025-10-01T00:00:00.000Z",
            endDate: "2025-10-15T00:00:00.000Z",
          },
        ],
        referent: { id: "referent-1", firstName: "Réf", lastName: "Erent" },
        promotion: "L2",
        decidedAt: data.decidedAt.toISOString(),
        decidedBy: { ...ADMIN, title: "responsable de stages L2 et L3 APA-S" },
      });
    });

    it("ADR-0033: never duplicates refusalReason or submittedAt inside the snapshot — they stay live Stage columns", async () => {
      await service.refuse(STAGE_ID, { version: 0, reason: "Adresse incomplète" }, ADMIN);

      const { data } = prisma.stage.updateMany.mock.calls[0][0];
      expect(data.snapshot).not.toHaveProperty("refusalReason");
      expect(data.snapshot).not.toHaveProperty("submittedAt");
      expect(data.snapshot).not.toHaveProperty("student");
    });

    it("throws instead of writing when a PENDING invariant is somehow violated (missing service)", async () => {
      prisma.stage.findUnique.mockResolvedValue(stageRow({ service: null }));

      await expect(
        service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN),
      ).rejects.toThrow(/has no submittedAt, organism, tutor, promotion, service/);
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("BR-07/BR-11: refusal email", () => {
    it("emails the university address only, no cc, when no personal address is on file", async () => {
      await service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toBeUndefined();
    });

    it("also cc's the personal address when one is on file", async () => {
      prisma.stage.findUnique.mockResolvedValue(
        stageRow({ student: student({ personalEmail: PERSONAL_EMAIL }) }),
      );

      await service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toEqual({ email: PERSONAL_EMAIL });
    });

    it("names the acting admin as NOM Prénom, <function> in the body, and includes the refusal reason", async () => {
      await service.refuse(STAGE_ID, { version: 0, reason: "Adresse incomplète" }, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.text).toContain("MARTIN Jean, responsable de stages L2 et L3 APA-S");
      expect(input.text).toContain("Adresse incomplète");
    });

    it("signs the email with NOM Prénom alone (no function in the signature)", async () => {
      await service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.text).toMatch(/Cordialement,\nMARTIN Jean$/);
    });
  });

  it("returns the refused stage's id, status, and decidedAt", async () => {
    const result = await service.refuse(STAGE_ID, { version: 0, reason: "Motif" }, ADMIN);

    expect(result).toEqual({
      id: STAGE_ID,
      status: "REFUSED",
      decidedAt: expect.any(String),
    });
  });
});
