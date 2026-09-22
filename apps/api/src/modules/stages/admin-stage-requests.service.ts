import { Injectable } from "@nestjs/common";
import type { AdminStageRequestListResponse, Promotion } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toReferentResponse } from "./referent-response";

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
          where: { status: "PENDING" },
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
      const { submittedAt, organism } = stage;
      // A PENDING stage was submitted (submittedAt is set) and its organism was
      // resolved at creation, but the schema allows neither to be null. Fail
      // with a message that names the stage rather than a bare TypeError.
      if (!submittedAt || !organism) {
        throw new Error(`PENDING stage ${stage.id} has no submittedAt or no organism`);
      }
      const referent = referentByTuple.get(tupleKey(stage));
      const [firstPeriod] = stage.periods;
      return {
        id: stage.id,
        version: stage.version,
        schoolYear: stage.schoolYear,
        semester: stage.semester,
        mandatory: stage.mandatory,
        service: stage.service,
        submittedAt: submittedAt.toISOString(),
        student: {
          id: stage.student.id,
          firstName: stage.student.user.firstName,
          lastName: stage.student.user.lastName,
          promotion: stage.student.promotion as Promotion | null,
        },
        organism: { name: organism.name, structureType: organism.structureType },
        firstPeriod: firstPeriod
          ? {
              id: firstPeriod.id,
              startDate: firstPeriod.startDate.toISOString(),
              endDate: firstPeriod.endDate.toISOString(),
            }
          : null,
        periodCount: stage.periods.length,
        referent: referent ? toReferentResponse(referent) : null,
      };
    });
  }
}
