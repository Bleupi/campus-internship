import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminStudentsService } from "./admin-students.service";

const STUDENT_ID = "profile-1";
const USER_ID = "user-1";

describe("AdminStudentsService", () => {
  let service: AdminStudentsService;
  let prisma: {
    studentProfile: {
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      studentProfile: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [AdminStudentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminStudentsService);
  });

  describe("validateProfile — ADR-0004: PENDING_VALIDATION -> VALID", () => {
    it("flips PENDING_VALIDATION to VALID via a status-conditioned updateMany", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({ userId: USER_ID });

      const result = await service.validateProfile(STUDENT_ID);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION"] } },
        data: { profileStatus: "VALID" },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "VALID" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "VALID",
      });

      await expect(service.validateProfile(STUDENT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.validateProfile(STUDENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("rejectProfile — ADR-0004: PENDING_VALIDATION/VALID -> INCOMPLETE", () => {
    it("flips PENDING_VALIDATION or VALID to INCOMPLETE via a status-conditioned updateMany", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({ userId: USER_ID });

      const result = await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION", "VALID"] } },
        data: { profileStatus: "INCOMPLETE" },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "INCOMPLETE" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "INCOMPLETE",
      });

      await expect(
        service.rejectProfile(STUDENT_ID, "Certificat illisible"),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectProfile(STUDENT_ID, "Certificat illisible"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
