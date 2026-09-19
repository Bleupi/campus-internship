import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { OrganismsService } from "./organisms.service";

describe("OrganismsService", () => {
  let service: OrganismsService;
  let prisma: {
    $queryRaw: jest.Mock;
    hostOrganism: { findUnique: jest.Mock };
    organismStructureType: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      hostOrganism: { findUnique: jest.fn() },
      organismStructureType: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [OrganismsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OrganismsService);
  });

  describe("search", () => {
    it("returns an empty array without querying when the query is empty or whitespace", async () => {
      expect(await service.search("")).toEqual([]);
      expect(await service.search("   ")).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("sends the search text as a bound parameter, never inlined into the SQL string (injection-safe)", async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.search("Cochin");

      const [sqlFragment] = prisma.$queryRaw.mock.calls[0]!;
      // Prisma.sql produces a Sql object whose `.values` holds the bound
      // parameters and whose `.sql` text holds a placeholder ("?") in their
      // place — asserting both proves the search text is never
      // string-concatenated into the query.
      expect(sqlFragment.values).toContain("%Cochin%");
      expect(sqlFragment.sql).not.toContain("Cochin");
      expect(sqlFragment.sql).toContain("unaccent");
      expect(sqlFragment.sql).toContain("ILIKE");
    });

    it("escapes LIKE metacharacters (%, _, \\) in the user's own search text", async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.search("100%_done");

      const [sqlFragment] = prisma.$queryRaw.mock.calls[0]!;
      expect(sqlFragment.values).toContain("%100\\%\\_done%");
    });

    it("returns the rows from the raw query", async () => {
      const rows = [
        { id: "org-1", name: "Hôpital Cochin", structureType: "Secteur Sanitaire", city: "Paris" },
      ];
      prisma.$queryRaw.mockResolvedValue(rows);

      expect(await service.search("Cochin")).toEqual(rows);
    });
  });

  describe("findById", () => {
    it("throws NotFoundException only when the organism itself doesn't exist", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue(null);

      await expect(service.findById("missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns an empty tutors array for a freshly created organism — this is normal, not an error", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue({
        id: "org-1",
        name: "Hôpital Cochin",
        structureType: "Secteur Sanitaire",
        city: "Paris",
        postalCode: "75014",
        street: "27 Rue du Faubourg Saint-Jacques",
        tutors: [],
      });

      const result = await service.findById("org-1");

      expect(result.tutors).toEqual([]);
    });

    it("maps tutors to the summary shape (never over-exposing extra Prisma fields)", async () => {
      prisma.hostOrganism.findUnique.mockResolvedValue({
        id: "org-1",
        name: "Hôpital Cochin",
        structureType: "Secteur Sanitaire",
        city: "Paris",
        postalCode: "75014",
        street: "27 Rue du Faubourg Saint-Jacques",
        tutors: [
          {
            id: "tutor-1",
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: null,
            acceptsPhoneContact: false,
            organismId: "org-1",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.findById("org-1");

      expect(result.tutors).toEqual([
        {
          id: "tutor-1",
          firstName: "Marie",
          lastName: "Curie",
          email: "m.curie@example.org",
          jobTitle: "Médecin",
          phone: null,
          acceptsPhoneContact: false,
        },
      ]);
    });
  });

  describe("listStructureTypes", () => {
    it("returns structure types ordered by label", async () => {
      const types = [
        { id: "st-1", label: "Secteur Associatif" },
        { id: "st-2", label: "Secteur Sanitaire" },
      ];
      prisma.organismStructureType.findMany.mockResolvedValue(types);

      expect(await service.listStructureTypes()).toEqual(types);
      expect(prisma.organismStructureType.findMany).toHaveBeenCalledWith({
        orderBy: { label: "asc" },
      });
    });
  });
});
