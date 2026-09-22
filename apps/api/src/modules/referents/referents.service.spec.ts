import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ReferentsService } from "./referents.service";

describe("ReferentsService", () => {
  let service: ReferentsService;
  let prisma: {
    referentProfile: { findMany: jest.Mock };
    referentAssignment: { upsert: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      referentProfile: { findMany: jest.fn() },
      referentAssignment: { upsert: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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

  describe("create — ADR-0031: a referent added on the fly from the picker", () => {
    const DTO = { firstName: "Claire", lastName: "Martin", email: "claire.martin@example.org" };

    it("ADR-0031: a new email creates a REFERENT user with a profile and a non-usable password", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        firstName: "Claire",
        lastName: "Martin",
        referentProfile: { id: "ref-new" },
      });

      const result = await service.create(DTO);

      expect(prisma.user.update).not.toHaveBeenCalled();
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data).toMatchObject({
        email: "claire.martin@example.org",
        firstName: "Claire",
        lastName: "Martin",
        roles: ["REFERENT"],
        referentProfile: { create: {} },
      });
      // A real bcrypt hash (so /auth/login fails cleanly instead of throwing
      // on a malformed hash) of a secret nobody ever sees.
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(result).toEqual({ id: "ref-new", firstName: "Claire", lastName: "Martin" });
    });

    it("looks the email up case-insensitively, so a differently-cased address still finds the existing user", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        firstName: "Claire",
        lastName: "Martin",
        referentProfile: { id: "ref-new" },
      });

      await service.create({ ...DTO, email: "Claire.Martin@Example.org" });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: "Claire.Martin@Example.org", mode: "insensitive" } },
        select: { id: true, roles: true },
      });
    });

    it("ADR-0031: an existing user's email adds the REFERENT role and a profile — name and password untouched, no new account", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "user-admin", roles: ["ADMIN"] });
      prisma.user.update.mockResolvedValue({
        firstName: "Alice",
        lastName: "Admin",
        referentProfile: { id: "ref-admin" },
      });

      const result = await service.create(DTO);

      expect(prisma.user.create).not.toHaveBeenCalled();
      const { where, data } = prisma.user.update.mock.calls[0][0];
      expect(where).toEqual({ id: "user-admin" });
      expect(data).toEqual({
        roles: { push: "REFERENT" },
        referentProfile: { upsert: { create: {}, update: { archived: false } } },
      });
      expect(result).toEqual({ id: "ref-admin", firstName: "Alice", lastName: "Admin" });
    });

    it("does not duplicate the REFERENT role when the existing user already holds it", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "user-ref", roles: ["REFERENT"] });
      prisma.user.update.mockResolvedValue({
        firstName: "Réf",
        lastName: "Existant",
        referentProfile: { id: "ref-existing" },
      });

      await service.create(DTO);

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.roles).toBeUndefined();
    });
  });
});
