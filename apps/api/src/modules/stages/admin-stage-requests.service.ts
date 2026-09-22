import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminStageRequestDetailResponse,
  AdminStageRequestListResponse,
  Promotion,
} from "shared";
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

  // Issue #147: the row-expand detail — everything the student provided for
  // one request. Scoped to PENDING like list() above (BR-03): a DRAFT was
  // never submitted, and a VALIDATED/REFUSED stage's display source is its
  // frozen snapshot (ADR-0003, BR-08), not these live relations, so both are
  // a 404 here rather than showing live data that may already have drifted
  // from what was decided.
  async getById(id: string): Promise<AdminStageRequestDetailResponse> {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      include: {
        organism: true,
        tutor: true,
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
    if (!stage || stage.status !== "PENDING") {
      throw new NotFoundException("Demande de stage introuvable");
    }
    // A PENDING stage was submitted (submittedAt is set) and its organism and
    // tutor were resolved at creation, but the schema allows all three to be
    // null. Fail with a message that names the stage rather than a bare
    // TypeError.
    const { submittedAt, organism, tutor } = stage;
    if (!submittedAt || !organism || !tutor) {
      throw new Error(`PENDING stage ${stage.id} has no submittedAt, organism or tutor`);
    }

    const assignment = await this.prisma.referentAssignment.findUnique({
      where: {
        studentId_schoolYear_semester_mandatory: {
          studentId: stage.studentId,
          schoolYear: stage.schoolYear,
          semester: stage.semester,
          mandatory: stage.mandatory,
        },
      },
      include: { referent: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });

    return {
      id: stage.id,
      version: stage.version,
      schoolYear: stage.schoolYear,
      semester: stage.semester,
      mandatory: stage.mandatory,
      service: stage.service,
      projectType: stage.projectType,
      motivation: stage.motivation,
      submittedAt: submittedAt.toISOString(),
      student: {
        id: stage.student.id,
        firstName: stage.student.user.firstName,
        lastName: stage.student.user.lastName,
        promotion: stage.student.promotion as Promotion | null,
      },
      organism: {
        name: organism.name,
        structureType: organism.structureType,
        street: organism.street,
        postalCode: organism.postalCode,
        city: organism.city,
      },
      tutor: {
        firstName: tutor.firstName,
        lastName: tutor.lastName,
        email: tutor.email,
        jobTitle: tutor.jobTitle,
        phone: tutor.phone,
        acceptsPhoneContact: tutor.acceptsPhoneContact,
      },
      periods: stage.periods.map((period) => ({
        id: period.id,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      })),
      referent: assignment ? toReferentResponse(assignment.referent) : null,
    };
  }
}
