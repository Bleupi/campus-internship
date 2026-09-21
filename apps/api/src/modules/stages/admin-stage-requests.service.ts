import { Injectable } from "@nestjs/common";
import type { AdminStageRequestListResponse, Promotion, StageStatus } from "shared";
import { PrismaService } from "../../prisma/prisma.service";

const PENDING = "PENDING" satisfies StageStatus;

// Same tuple the assignment table is keyed on (ADR-0014).
function tupleKey(tuple: {
  studentId: string;
  schoolYear: string;
  semester: string;
  mandatory: boolean;
}): string {
  return `${tuple.studentId}|${tuple.schoolYear}|${tuple.semester}|${tuple.mandatory}`;
}

@Injectable()
export class AdminStageRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // Issue #146: every PENDING stage, oldest submission first (`id` only breaks
  // ties, for a deterministic order). No pagination in V1. The referent is not
  // stored on Stage (ADR-0003): it is derived here from ReferentAssignment for
  // each stage's exact (student, schoolYear, semester, mandatory) tuple, so a
  // referent assigned for the other `mandatory` value never shows (BR-03).
  async list(): Promise<AdminStageRequestListResponse> {
    // One snapshot for both reads, as in the certificate queue: a row deleted
    // between two statements must not leave a null relation to dereference.
    const { stages, assignments } = await this.prisma.$transaction(
      async (tx) => {
        const stages = await tx.stage.findMany({
          where: { status: PENDING },
          orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
          include: {
            organism: { select: { name: true, structureType: true } },
            periods: { orderBy: { startDate: "asc" } },
            student: {
              select: {
                id: true,
                promotion: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        });
        const assignments = await tx.referentAssignment.findMany({
          where: { studentId: { in: [...new Set(stages.map((stage) => stage.studentId))] } },
          include: {
            referent: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        });
        return { stages, assignments };
      },
      { isolationLevel: "RepeatableRead" },
    );

    const referentByTuple = new Map(
      assignments.map((assignment) => [tupleKey(assignment), assignment.referent]),
    );

    return stages.map((stage) => {
      const referent = referentByTuple.get(tupleKey(stage));
      const [firstPeriod] = stage.periods;
      return {
        id: stage.id,
        version: stage.version,
        schoolYear: stage.schoolYear,
        semester: stage.semester,
        mandatory: stage.mandatory,
        service: stage.service,
        // A PENDING stage was submitted, so the date is always set.
        submittedAt: stage.submittedAt!.toISOString(),
        student: {
          id: stage.student.id,
          firstName: stage.student.user.firstName,
          lastName: stage.student.user.lastName,
          promotion: stage.student.promotion as Promotion | null,
        },
        // Always set: createDraft resolves (finds or creates) the organism.
        organism: {
          name: stage.organism!.name,
          structureType: stage.organism!.structureType,
        },
        firstPeriod: firstPeriod
          ? {
              id: firstPeriod.id,
              startDate: firstPeriod.startDate.toISOString(),
              endDate: firstPeriod.endDate.toISOString(),
            }
          : null,
        periodCount: stage.periods.length,
        referent: referent
          ? {
              id: referent.id,
              firstName: referent.user.firstName,
              lastName: referent.user.lastName,
            }
          : null,
      };
    });
  }
}
