import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminStudentsQueueService } from "./admin-students-queue.service";

describe("AdminStudentsQueueService", () => {
  let service: AdminStudentsQueueService;
  let prisma: { studentProfile: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { studentProfile: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [AdminStudentsQueueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminStudentsQueueService);
  });

  describe("list — issue #42: PENDING_VALIDATION queue, oldest-updatedAt-first", () => {
    it("queries only PENDING_VALIDATION profiles ordered oldest-updatedAt-first", async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);

      await service.list();

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profileStatus: "PENDING_VALIDATION" },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        }),
      );
    });

    it("maps each profile to student identity, promotion, waiting-since and current certificate metadata", async () => {
      prisma.studentProfile.findMany.mockResolvedValue([
        {
          id: "profile-1",
          promotion: "L3",
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
          user: { firstName: "Alice", lastName: "Martin" },
          files: [
            {
              uploadedAt: new Date("2026-07-15T00:00:00.000Z"),
            },
          ],
        },
      ]);

      const result = await service.list();

      expect(result).toEqual([
        {
          studentId: "profile-1",
          firstName: "Alice",
          lastName: "Martin",
          promotion: "L3",
          waitingSince: "2026-08-01T00:00:00.000Z",
          certificate: {
            uploadedAt: "2026-07-15T00:00:00.000Z",
          },
        },
      ]);
    });

    it("reports a null certificate when no current (non-expired) INSURANCE_CERTIFICATE exists", async () => {
      prisma.studentProfile.findMany.mockResolvedValue([
        {
          id: "profile-2",
          promotion: "L2",
          updatedAt: new Date("2026-08-02T00:00:00.000Z"),
          user: { firstName: "Bob", lastName: "Durand" },
          files: [],
        },
      ]);

      const result = await service.list();

      expect(result[0]?.certificate).toBeNull();
    });
  });
});
