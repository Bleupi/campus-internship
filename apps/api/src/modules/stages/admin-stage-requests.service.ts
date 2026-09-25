import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import {
  STAGE_CONFLICT_CODES,
  type AdminStageRequestDetailResponse,
  type AdminStageRequestListResponse,
  type RefuseStageRequest,
  type RefuseStageResponse,
  type StageConflictCode,
  type ValidateStageRequest,
  type ValidateStageResponse,
} from "shared";
import {
  ADMIN_TITLE,
  adminDisplayName,
  composeStudentEmail,
  type ActingAdmin as AdminNameAndFunction,
} from "../../common/admin-email.util";
import { PrismaService } from "../../prisma/prisma.service";
import type { EmailRecipient } from "../mailer/mailer.service";
import { MailerService } from "../mailer/mailer.service";
import { toReferentResponse } from "./referent-response";
import { CURRENT_STAGE_SNAPSHOT_VERSION, parseStageSnapshot } from "./stage-snapshot.schema";

// This writer also freezes the admin's id into the snapshot (BR-08's
// decidedBy), which admin-email.util.ts's shared ActingAdmin (used purely
// for the BR-11 naming/email convention) doesn't carry.
type ActingAdmin = AdminNameAndFunction & { id: string };

// Same 409-with-machine-readable-code shape as stages.service.ts's own
// stageConflict() — duplicated rather than imported across modules for one
// small helper.
function stageConflict(code: StageConflictCode, message: string): ConflictException {
  return new ConflictException({ statusCode: 409, error: "Conflict", message, code });
}

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
  private readonly logger = new Logger(AdminStageRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  // Issue #146: every PENDING stage, oldest submission first (`id` only breaks
  // ties, for a deterministic order). No pagination in V1. The referent is not
  // stored on Stage (ADR-0003): it is derived here from ReferentAssignment for
  // each stage's exact (student, schoolYear, semester, mandatory) tuple, so a
  // referent assigned for the other `mandatory` value never shows (BR-03).
  async list(): Promise<AdminStageRequestListResponse> {
    // One snapshot for both reads, as in the certificate queue: a row deleted
    // between two statements must not leave a null relation to dereference.
    const { stages, assignments, liveStageCounts } = await this.prisma.$transaction(
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
        const studentIds = [...new Set(stages.map((stage) => stage.studentId))];
        const assignments = await tx.referentAssignment.findMany({
          where: { studentId: { in: studentIds } },
          include: {
            referent: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        });
        // Issue #149: live stages per tuple, so each row knows what else a
        // referent change on it would reassign. Decided stages are left out:
        // their referent is frozen in the snapshot (BR-08).
        const liveStageCounts = await tx.stage.groupBy({
          by: ["studentId", "schoolYear", "semester", "mandatory"],
          where: { studentId: { in: studentIds }, status: { in: ["DRAFT", "PENDING"] } },
          _count: { _all: true },
        });
        return { stages, assignments, liveStageCounts };
      },
      { isolationLevel: "RepeatableRead" },
    );

    const referentByTuple = new Map(
      assignments.map((assignment) => [tupleKey(assignment), assignment.referent]),
    );
    const liveCountByTuple = new Map(
      liveStageCounts.map((group) => [tupleKey(group), group._count._all]),
    );

    return stages.map((stage) => {
      const { submittedAt, organism, student, service } = stage;
      // A PENDING stage was submitted (submittedAt is set), its organism was
      // resolved at creation, and its request was complete (BR-02: service
      // non-blank) from a VALID profile (which requires promotion to be set,
      // students.service.ts, and it is never cleared afterward). The schema
      // allows all four to be null, so fail with a message that names the
      // stage rather than a bare TypeError.
      if (!submittedAt || !organism || !student.promotion || !service) {
        // CLAUDE.md §5: shaped like every other error this service raises,
        // not a raw Error left for Nest's default (unshaped) 500 handler.
        throw new InternalServerErrorException(
          `PENDING stage ${stage.id} has no submittedAt, organism, promotion, or service`,
        );
      }
      const referent = referentByTuple.get(tupleKey(stage));
      // The stage itself is PENDING, so it is always part of its own live
      // group (same snapshot); a missing group is a broken invariant.
      const liveCount = liveCountByTuple.get(tupleKey(stage));
      if (liveCount === undefined) {
        throw new InternalServerErrorException(
          `PENDING stage ${stage.id} is missing from its own live tuple group`,
        );
      }
      const [firstPeriod] = stage.periods;
      return {
        id: stage.id,
        version: stage.version,
        schoolYear: stage.schoolYear,
        semester: stage.semester,
        mandatory: stage.mandatory,
        service,
        submittedAt: submittedAt.toISOString(),
        student: {
          id: student.id,
          firstName: student.user.firstName,
          lastName: student.user.lastName,
          promotion: student.promotion,
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
        otherLiveStageCount: liveCount - 1,
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
    // One snapshot for both reads (same reasoning as list() above): the
    // referent lookup depends on the stage's studentId/schoolYear/semester/
    // mandatory, so a row deleted between the two statements must not leave
    // a null relation to dereference.
    const { stage, assignment } = await this.prisma.$transaction(
      async (tx) => {
        const stage = await tx.stage.findUnique({
          where: { id },
          include: {
            organism: {
              select: {
                name: true,
                structureType: true,
                street: true,
                postalCode: true,
                city: true,
              },
            },
            tutor: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                jobTitle: true,
                phone: true,
                acceptsPhoneContact: true,
              },
            },
            periods: { orderBy: { startDate: "asc" } },
            student: {
              select: {
                id: true,
                promotion: true,
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        });
        if (!stage || stage.status !== "PENDING") {
          throw new NotFoundException("Demande de stage introuvable");
        }
        const assignment = await tx.referentAssignment.findUnique({
          where: {
            studentId_schoolYear_semester_mandatory: {
              studentId: stage.studentId,
              schoolYear: stage.schoolYear,
              semester: stage.semester,
              mandatory: stage.mandatory,
            },
          },
          include: {
            referent: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        });
        return { stage, assignment };
      },
      { isolationLevel: "RepeatableRead" },
    );
    // A PENDING stage was submitted (submittedAt is set), its organism and
    // tutor were resolved at creation, its request was complete (BR-02:
    // service/projectType/motivation all non-blank), and its student's
    // profile was VALID at submission time — which requires promotion to be
    // set (students.service.ts) and it is never cleared afterward. The
    // schema allows all of these to be null, so fail with a message that
    // names the stage rather than a bare TypeError.
    const { submittedAt, organism, tutor, student, service, projectType, motivation } = stage;
    if (
      !submittedAt ||
      !organism ||
      !tutor ||
      !student.promotion ||
      !service ||
      !projectType ||
      !motivation
    ) {
      throw new InternalServerErrorException(
        `PENDING stage ${stage.id} has no submittedAt, organism, tutor, promotion, service, projectType, or motivation`,
      );
    }

    return {
      id: stage.id,
      version: stage.version,
      schoolYear: stage.schoolYear,
      semester: stage.semester,
      mandatory: stage.mandatory,
      service,
      projectType,
      motivation,
      submittedAt: submittedAt.toISOString(),
      student: {
        id: student.id,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        email: student.user.email,
        promotion: student.promotion,
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

  // Shared by refuseStage() and validateStage() (issues #151/#152): the exact-tuple
  // fetch, not-found/not-PENDING checks, the PENDING-completeness invariant
  // and referent assignment lookup are identical for both decisions — only
  // the target status, whether a `reason` exists, and the notification
  // differ. Extracted after both writers existed side by side (review
  // follow-up on issue #152), not built ahead of a second real need.
  private async findPendingStageOrThrow(id: string, notPendingMessage: string) {
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
            personalEmail: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!stage) {
      throw new NotFoundException("Demande de stage introuvable");
    }
    if (stage.status !== "PENDING") {
      throw stageConflict(STAGE_CONFLICT_CODES.NOT_PENDING, notPendingMessage);
    }

    // Same invariant as getById() above, restated: a PENDING stage was
    // submitted, its organism/tutor were resolved, its request was complete
    // (BR-02), and its student's profile was VALID at submission (promotion
    // set, students.service.ts, never cleared afterward). The schema allows
    // all of these to be null, so fail with a message that names the stage
    // rather than a downstream TypeError in refuseStage()/validateStage().
    const { submittedAt, organism, tutor, student, service, projectType, motivation } = stage;
    if (
      !submittedAt ||
      !organism ||
      !tutor ||
      !student.promotion ||
      !service ||
      !projectType ||
      !motivation
    ) {
      throw new Error(
        `PENDING stage ${stage.id} has no submittedAt, organism, tutor, promotion, service, projectType, or motivation`,
      );
    }

    return {
      ...stage,
      submittedAt,
      organism,
      tutor,
      service,
      projectType,
      motivation,
      student: { ...student, promotion: student.promotion },
    };
  }

  // BR-03: the referent frozen into the snapshot (and, for validateStage(),
  // cc'd on the email) is the one assigned for the stage's exact (student,
  // schoolYear, semester, mandatory) tuple — a referent assigned for the
  // other `mandatory` value never satisfies it. Always selects the
  // referent's email: refuseStage() doesn't use it, but selecting one extra
  // column is cheaper than a second query shape for validateStage().
  private async findAssignedReferentOrThrow(
    stage: { studentId: string; schoolYear: string; semester: "S1" | "S2"; mandatory: boolean },
    noReferentMessage: string,
  ) {
    const assignment = await this.prisma.referentAssignment.findUnique({
      where: {
        studentId_schoolYear_semester_mandatory: {
          studentId: stage.studentId,
          schoolYear: stage.schoolYear,
          semester: stage.semester,
          mandatory: stage.mandatory,
        },
      },
      include: {
        referent: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });
    if (!assignment) {
      throw stageConflict(STAGE_CONFLICT_CODES.NO_REFERENT, noReferentMessage);
    }
    return assignment;
  }

  // ADR-0033: the stage detail's own shape, minus what stays a live column
  // (id, status, version, submittedAt, refusalReason), plus what only
  // exists at decision time (decidedAt, decidedBy, promotion). Parsed here
  // too (not just assumed), so a snapshot this write can't read back fails
  // at write time instead of freezing a corrupt document. Shared by
  // refuseStage() and validateStage(): identical shape either way (BR-08).
  private buildDecisionSnapshot(params: {
    stage: { schoolYear: string; semester: "S1" | "S2"; mandatory: boolean };
    service: string;
    projectType: string;
    motivation: string;
    organism: {
      id: string;
      name: string;
      structureType: string;
      city: string;
      postalCode: string;
      street: string;
    };
    tutor: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      jobTitle: string;
      phone: string | null;
      acceptsPhoneContact: boolean;
    };
    periods: { id: string; startDate: Date; endDate: Date }[];
    referent: { id: string; firstName: string; lastName: string };
    promotion: string;
    decidedAt: Date;
    admin: ActingAdmin;
  }) {
    return parseStageSnapshot(
      {
        schoolYear: params.stage.schoolYear,
        semester: params.stage.semester,
        mandatory: params.stage.mandatory,
        service: params.service,
        projectType: params.projectType,
        motivation: params.motivation,
        organism: params.organism,
        tutor: params.tutor,
        periods: params.periods.map((period) => ({
          id: period.id,
          startDate: period.startDate.toISOString(),
          endDate: period.endDate.toISOString(),
        })),
        referent: params.referent,
        promotion: params.promotion,
        decidedAt: params.decidedAt.toISOString(),
        decidedBy: { ...params.admin, title: ADMIN_TITLE },
      },
      CURRENT_STAGE_SNAPSHOT_VERSION,
    );
  }

  // Issue #151 (BR-03, BR-08, BR-09): PENDING -> REFUSED. Freezes an
  // immutable snapshot, requires the referent assigned for the stage's exact
  // tuple, and matches the version it was read at before writing.
  async refuseStage(
    id: string,
    dto: RefuseStageRequest,
    admin: ActingAdmin,
  ): Promise<RefuseStageResponse> {
    const stage = await this.findPendingStageOrThrow(
      id,
      "Seule une demande soumise peut être refusée",
    );
    const assignment = await this.findAssignedReferentOrThrow(
      stage,
      "Un référent doit être assigné avant de refuser cette demande",
    );
    const { organism, tutor, student, service, projectType, motivation } = stage;

    const referent = toReferentResponse(assignment.referent);
    const decidedAt = new Date();
    const snapshot = this.buildDecisionSnapshot({
      stage,
      service,
      projectType,
      motivation,
      organism,
      tutor,
      periods: stage.periods,
      referent,
      promotion: student.promotion,
      decidedAt,
      admin,
    });

    // BR-09: matching on the version we were given makes a write that lost a
    // race update zero rows, instead of silently overwriting.
    const { count } = await this.prisma.stage.updateMany({
      where: { id: stage.id, status: "PENDING", version: dto.version },
      data: {
        status: "REFUSED",
        refusalReason: dto.reason,
        snapshot,
        snapshotVersion: CURRENT_STAGE_SNAPSHOT_VERSION,
        decidedAt,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw stageConflict(
        STAGE_CONFLICT_CODES.VERSION_CONFLICT,
        "Cette demande a été modifiée entre-temps. Rechargez la page et réessayez.",
      );
    }

    await this.notifyStudentOfRefusal(student, organism.name, dto.reason, admin);

    return { id: stage.id, status: "REFUSED", decidedAt: decidedAt.toISOString() };
  }

  // Issue #152 (BR-03, BR-08, BR-09): PENDING -> VALIDATED. Same snapshot
  // shape and preconditions as refuseStage() above (ADR-0033) — the only
  // differences are the target status, no `reason`, and the notification
  // email additionally cc'ing the referent (BR-07).
  async validateStage(
    id: string,
    dto: ValidateStageRequest,
    admin: ActingAdmin,
  ): Promise<ValidateStageResponse> {
    const stage = await this.findPendingStageOrThrow(
      id,
      "Seule une demande soumise peut être validée",
    );
    const assignment = await this.findAssignedReferentOrThrow(
      stage,
      "Un référent doit être assigné avant de valider cette demande",
    );
    const { organism, tutor, student, service, projectType, motivation } = stage;

    const referent = toReferentResponse(assignment.referent);
    const decidedAt = new Date();
    // ADR-0033: the same snapshot shape as refusal — no `reason` field exists
    // on a validation, so none is passed here.
    const snapshot = this.buildDecisionSnapshot({
      stage,
      service,
      projectType,
      motivation,
      organism,
      tutor,
      periods: stage.periods,
      referent,
      promotion: student.promotion,
      decidedAt,
      admin,
    });

    // BR-09: matching on the version we were given makes a write that lost a
    // race update zero rows, instead of silently overwriting.
    const { count } = await this.prisma.stage.updateMany({
      where: { id: stage.id, status: "PENDING", version: dto.version },
      data: {
        status: "VALIDATED",
        snapshot,
        snapshotVersion: CURRENT_STAGE_SNAPSHOT_VERSION,
        decidedAt,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw stageConflict(
        STAGE_CONFLICT_CODES.VERSION_CONFLICT,
        "Cette demande a été modifiée entre-temps. Rechargez la page et réessayez.",
      );
    }

    await this.notifyStudentOfValidation(student, organism.name, assignment.referent, admin);

    return { id: stage.id, status: "VALIDATED", decidedAt: decidedAt.toISOString() };
  }

  // BR-07/BR-11: same recipients/naming/failure-handling convention as
  // AdminStudentsService's profile emails — institutional address always,
  // personal address cc'd when on file, acting admin named "NOM Prénom,
  // <function>", and a send failure never rolls back the already-committed
  // decision (ADR-0026, MailerService.sendSafely).
  private async notifyStudentOfRefusal(
    student: { personalEmail: string | null; user: { email: string; firstName: string } },
    organismName: string,
    reason: string,
    admin: ActingAdmin,
  ): Promise<void> {
    const adminName = adminDisplayName(admin);
    await this.mailerService.sendSafely(
      {
        to: { email: student.user.email },
        cc: student.personalEmail ? { email: student.personalEmail } : undefined,
        subject: "Votre demande de stage a été refusée",
        text: composeStudentEmail(
          student.user.firstName,
          adminName,
          `Votre demande de stage auprès de ${organismName} a été examinée par ${adminName}, ${ADMIN_TITLE}, et n'a pas pu être validée, pour le motif suivant :\n\n${reason}`,
          "Vous pouvez corriger votre demande et la soumettre à nouveau depuis votre espace étudiant.",
        ),
      },
      this.logger,
    );
  }

  // BR-07/BR-11: same convention as notifyStudentOfRefusal above, with one
  // addition — the stage's referent is cc'd too, visibly (not bcc), so the
  // student and the referent see each other's address.
  private async notifyStudentOfValidation(
    student: { personalEmail: string | null; user: { email: string; firstName: string } },
    organismName: string,
    referent: { user: { email: string } },
    admin: ActingAdmin,
  ): Promise<void> {
    const adminName = adminDisplayName(admin);
    const cc: EmailRecipient[] = [];
    if (student.personalEmail) {
      cc.push({ email: student.personalEmail });
    }
    cc.push({ email: referent.user.email });
    await this.mailerService.sendSafely(
      {
        to: { email: student.user.email },
        cc,
        subject: "Votre demande de stage a été validée",
        text: composeStudentEmail(
          student.user.firstName,
          adminName,
          `Votre demande de stage auprès de ${organismName} a été examinée par ${adminName}, ${ADMIN_TITLE}, et a été validée.`,
          "Vous pouvez consulter les détails de votre stage depuis votre espace étudiant.",
        ),
      },
      this.logger,
    );
  }
}
