import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { OrganismDetailResponse, OrganismSearchResultItem, StructureTypeOption } from "shared";
import { PrismaService } from "../../prisma/prisma.service";

// Escapes Postgres LIKE/ILIKE metacharacters (%, _, and the escape
// character \ itself) in the user's own search text, so e.g. a student
// searching for a literal "%" in an organism name gets a literal match
// instead of an accidental wildcard. This is a correctness fix, not a
// security one — SQL injection is already closed by $queryRaw's
// parameterization below (never string concatenation / $queryRawUnsafe).
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class OrganismsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string): Promise<OrganismSearchResultItem[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const pattern = `%${escapeLikePattern(trimmed)}%`;

    // Tagged-template $queryRaw: every interpolated value (here, `pattern`)
    // is sent as a real bound parameter, never inlined into the SQL text.
    return this.prisma.$queryRaw<OrganismSearchResultItem[]>(
      Prisma.sql`
        SELECT id, name, "structureType", city
        FROM "HostOrganism"
        WHERE unaccent(name) ILIKE unaccent(${pattern})
        ORDER BY name
        LIMIT 20
      `,
    );
  }

  async findById(id: string): Promise<OrganismDetailResponse> {
    const organism = await this.prisma.hostOrganism.findUnique({
      where: { id },
      include: { tutors: true },
    });

    // Only the organism's own existence is checked here. A freshly created
    // organism with zero tutors yet is a perfectly normal state, not an
    // error — the response just comes back with an empty `tutors` array,
    // and the frontend renders only the "Nouveau tuteur" option.
    if (!organism) {
      throw new NotFoundException("Organisme introuvable");
    }

    return {
      id: organism.id,
      name: organism.name,
      structureType: organism.structureType,
      city: organism.city,
      postalCode: organism.postalCode,
      street: organism.street,
      tutors: organism.tutors.map((tutor) => ({
        id: tutor.id,
        firstName: tutor.firstName,
        lastName: tutor.lastName,
        email: tutor.email,
        jobTitle: tutor.jobTitle,
        phone: tutor.phone,
        acceptsPhoneContact: tutor.acceptsPhoneContact,
      })),
    };
  }

  async listStructureTypes(): Promise<StructureTypeOption[]> {
    const types = await this.prisma.organismStructureType.findMany({
      orderBy: { label: "asc" },
    });
    return types.map((type) => ({ id: type.id, label: type.label }));
  }
}
