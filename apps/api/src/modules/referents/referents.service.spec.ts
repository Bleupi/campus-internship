import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ReferentsService } from "./referents.service";

describe("ReferentsService", () => {
  let service: ReferentsService;
  let prisma: {
    referentProfile: { findMany: jest.Mock };
    referentAssignment: { upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      referentProfile: { findMany: jest.fn() },
      referentAssignment: { upsert: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [ReferentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReferentsService);
  });

  describe("list", () => {
    it("issue #148: filters out archived referents and sorts by last name at the query level", async () => {
      prisma.referentProfile.findMany.mockResolvedValue([]);

      await service.list();

      expect(prisma.referentProfile.findMany).toHaveBeenCalledWith({
        where: { archived: false },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { user: { lastName: "asc" } },
      });
    });

    it("maps each referent to its id and name", async () => {
      prisma.referentProfile.findMany.mockResolvedValue([
        { id: "ref-1", user: { firstName: "Réf", lastName: "Un" } },
      ]);

      const result = await service.list();

      expect(result).toEqual([{ id: "ref-1", firstName: "Réf", lastName: "Un" }]);
    });
  });

  describe("assign — ADR-0014: upsert on the four-tuple as an in-place update", () => {
    const DTO = {
      studentId: "student-1",
      schoolYear: "2099-2100",
      semester: "S1" as const,
      mandatory: true,
      referentId: "ref-2",
    };

    it("upserts on the (studentId, schoolYear, semester, mandatory) compound key, updating referentId in place on a conflict", async () => {
      prisma.referentAssignment.upsert.mockResolvedValue({
        referent: { id: "ref-2", user: { firstName: "Réf", lastName: "Deux" } },
      });

      await service.assign(DTO);

      expect(prisma.referentAssignment.upsert).toHaveBeenCalledWith({
        where: {
          studentId_schoolYear_semester_mandatory: {
            studentId: "student-1",
            schoolYear: "2099-2100",
            semester: "S1",
            mandatory: true,
          },
        },
        update: { referentId: "ref-2" },
        create: {
          studentId: "student-1",
          schoolYear: "2099-2100",
          semester: "S1",
          mandatory: true,
          referentId: "ref-2",
        },
        include: {
          referent: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      });
    });

    it("BR-03: the mandatory flag is part of the match key, so a different mandatory value upserts a distinct row", async () => {
      prisma.referentAssignment.upsert.mockResolvedValue({
        referent: { id: "ref-2", user: { firstName: "Réf", lastName: "Deux" } },
      });

      await service.assign({ ...DTO, mandatory: false });

      const call = prisma.referentAssignment.upsert.mock.calls[0][0];
      expect(call.where.studentId_schoolYear_semester_mandatory.mandatory).toBe(false);
      expect(call.create.mandatory).toBe(false);
    });

    it("returns the newly assigned referent", async () => {
      prisma.referentAssignment.upsert.mockResolvedValue({
        referent: { id: "ref-2", user: { firstName: "Réf", lastName: "Deux" } },
      });

      const result = await service.assign(DTO);

      expect(result).toEqual({ id: "ref-2", firstName: "Réf", lastName: "Deux" });
    });
  });
});
