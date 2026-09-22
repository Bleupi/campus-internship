import { Injectable } from "@nestjs/common";
import type { AssignReferentRequest, AssignReferentResponse, ReferentListResponse } from "shared";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReferentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Issue #148: all non-archived referents, sorted by last name — no
  // workload hint (explicitly rejected in #144's grilling).
  async list(): Promise<ReferentListResponse> {
    const referents = await this.prisma.referentProfile.findMany({
      where: { archived: false },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
    });
    return referents.map((referent) => ({
      id: referent.id,
      firstName: referent.user.firstName,
      lastName: referent.user.lastName,
    }));
  }

  // ADR-0014: upsert on the four-tuple as an in-place UPDATE, never a second
  // row — the unique constraint on (studentId, schoolYear, semester,
  // mandatory) guarantees that. This never touches Stage at all, so it can
  // never bump a Stage.version or reach a VALIDATED/REFUSED stage's frozen
  // snapshot: a decided stage's referent is read from the snapshot, not
  // derived from this table, by construction (ADR-0003).
  async assign(dto: AssignReferentRequest): Promise<AssignReferentResponse> {
    const assignment = await this.prisma.referentAssignment.upsert({
      where: {
        studentId_schoolYear_semester_mandatory: {
          studentId: dto.studentId,
          schoolYear: dto.schoolYear,
          semester: dto.semester,
          mandatory: dto.mandatory,
        },
      },
      update: { referentId: dto.referentId },
      create: {
        studentId: dto.studentId,
        schoolYear: dto.schoolYear,
        semester: dto.semester,
        mandatory: dto.mandatory,
        referentId: dto.referentId,
      },
      include: {
        referent: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return {
      id: assignment.referent.id,
      firstName: assignment.referent.user.firstName,
      lastName: assignment.referent.user.lastName,
    };
  }
}
