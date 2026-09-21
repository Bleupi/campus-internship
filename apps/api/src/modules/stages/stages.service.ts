import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  deriveSemester,
  getCurrentSchoolYear,
  getSubmissionBlockers,
  STAGE_CONFLICT_CODES,
  type CreateStageDraftRequest,
  type ListStagesQuery,
  type StageConflictCode,
  type StageDetailResponse,
  type StageDraftPeriodResponse,
  type StageDraftResponse,
  type StageListItemResponse,
  type UpdateStageDraftRequest,
} from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";

type Tx = Prisma.TransactionClient;

// Whether the student may still correct the organism / tutor their draft points
// to, in place (issue #116).
interface EditableFlags {
  organism: boolean;
  tutor: boolean;
}

// 409 with a machine-readable `code`, so the web can tell a stale version
// (reload the draft) from a frozen row (create a new one).
function stageConflict(code: StageConflictCode, message: string): ConflictException {
  return new ConflictException({ statusCode: 409, error: "Conflict", message, code });
}

// A stage with the single start time it is ranked by in the list.
interface RankedStage {
  stage: StageListItemResponse;
  rankingStartTime: number;
}

// Periods are stored as UTC midnight, so "today" is measured from the start of
// the UTC day: a stage starting today is not in the past yet.
function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

@Injectable()
export class StagesService {
  private readonly logger = new Logger(StagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  // Issue #113: organism/tutor find-or-create + Stage/StagePeriod creation
  // all happen in one transaction, so a mid-wizard failure (e.g. a supplied
  // tutor that doesn't actually belong to the resolved organism) never
  // leaves an orphaned HostOrganism/Tutor row behind.
  async createDraft(userId: string, dto: CreateStageDraftRequest): Promise<StageDraftResponse> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("Profil étudiant introuvable");
    }

    // BR-04b: derived here, server-side, from the periods — createStageDraftSchema
    // has no `semester` field at all, so there is nothing client-supplied to ignore.
    const schoolYear = getCurrentSchoolYear(dto.periods[0]!.startDate);
    const semester = deriveSemester(dto.periods);

    const stage = await this.prisma.$transaction(async (tx) => {
      const organismId = await this.resolveOrganism(tx, dto.organism);
      const tutorId = await this.resolveTutor(tx, dto.tutor, organismId);

      return tx.stage.create({
        data: {
          status: "DRAFT",
          studentId: profile.id,
          organismId,
          tutorId,
          schoolYear,
          semester,
          mandatory: dto.mandatory,
          service: dto.service ?? null,
          projectType: dto.projectType ?? null,
          motivation: dto.motivation ?? null,
          periods: {
            create: dto.periods.map((period) => ({
              startDate: period.startDate,
              endDate: period.endDate,
            })),
          },
        },
        include: { periods: true, organism: true, tutor: true },
      });
    });

    return this.toResponse(stage, await this.loadEditable(this.prisma, stage));
  }

  // Issue #116: the wizard's PATCH. It replaces the draft's whole wizard content
  // in one transaction, so a rejected write (stale version, frozen row, a tutor
  // that isn't the organism's) leaves no half-edited organism/tutor/period behind.
  async updateDraft(
    userId: string,
    stageId: string,
    dto: UpdateStageDraftRequest,
  ): Promise<StageDetailResponse> {
    // BR-04b: re-derived from the submitted periods, like on creation. The
    // schema has no `semester` field, so a client-supplied one never gets here.
    const schoolYear = getCurrentSchoolYear(dto.periods[0]!.startDate);
    const semester = deriveSemester(dto.periods);

    await this.prisma.$transaction(async (tx) => {
      // Ownership is part of the lookup: another student's stage is a 404.
      const stage = await tx.stage.findFirst({
        where: { id: stageId, student: { userId } },
      });
      if (!stage) {
        throw new NotFoundException("Demande de stage introuvable");
      }
      if (stage.status !== "DRAFT") {
        throw stageConflict(STAGE_CONFLICT_CODES.NOT_DRAFT, "Seul un brouillon peut être modifié");
      }
      if (stage.version !== dto.version) {
        throw this.versionConflict();
      }

      const organismId = await this.resolveOrganismForUpdate(tx, stage, dto.organism);
      const tutorId = await this.resolveTutorForUpdate(tx, stage, dto.tutor, organismId);

      // BR-09: the actual guard. Matching on the version we were given makes a
      // write that lost a race update zero rows; throwing then rolls back the
      // organism/tutor edits above along with it.
      const { count } = await tx.stage.updateMany({
        where: { id: stage.id, status: "DRAFT", version: dto.version },
        data: {
          organismId,
          tutorId,
          schoolYear,
          semester,
          mandatory: dto.mandatory,
          service: dto.service ?? null,
          projectType: dto.projectType ?? null,
          motivation: dto.motivation ?? null,
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        throw this.versionConflict();
      }

      await tx.stagePeriod.deleteMany({ where: { stageId: stage.id } });
      await tx.stagePeriod.createMany({
        data: dto.periods.map((period) => ({
          stageId: stage.id,
          startDate: period.startDate,
          endDate: period.endDate,
        })),
      });
    });

    return this.getById(userId, stageId);
  }

  // Issue #114. Scoped by the caller's own student profile, so a student can
  // never list someone else's stages whatever the query says.
  async list(userId: string, query: ListStagesQuery): Promise<StageListItemResponse[]> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("Profil étudiant introuvable");
    }

    const stages = await this.prisma.stage.findMany({
      where: {
        studentId: profile.id,
        ...(query.status && { status: query.status }),
        ...(query.semester && { semester: query.semester }),
      },
      include: { periods: true, organism: { select: { name: true } } },
      // Never-submitted drafts have no submittedAt: they go last, newest first.
      orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });

    const items = stages.map((stage) => this.toListItem(stage));
    return query.sort === "startDate" ? this.sortByNearestStart(items) : items;
  }

  // Issue #114, ADR-0003's single read path. The 404 is keyed on id AND owner
  // in one query, so another student's stage is indistinguishable from a
  // non-existent one (no existence leak).
  async getById(userId: string, stageId: string): Promise<StageDetailResponse> {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, student: { userId } },
      include: { periods: true, organism: true, tutor: true },
    });
    if (!stage) {
      throw new NotFoundException("Demande de stage introuvable");
    }

    if (stage.status === "VALIDATED" || stage.status === "REFUSED") {
      // The frozen-snapshot branch is deliberately stubbed: nothing writes a
      // snapshot yet (validate/refuse are later issues), so there is no
      // schema to parse it with. Reading the live relations here instead
      // would violate BR-08.
      throw new NotImplementedException("Lecture du snapshot non implémentée");
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
      include: { referent: { include: { user: true } } },
    });

    return {
      ...this.toResponse(stage, await this.loadEditable(this.prisma, stage)),
      submittedAt: stage.submittedAt?.toISOString() ?? null,
      refusalReason: stage.refusalReason,
      referent: assignment && {
        id: assignment.referent.id,
        firstName: assignment.referent.user.firstName,
        lastName: assignment.referent.user.lastName,
      },
    };
  }

  // Issue #115 (BR-02, BR-07, BR-09): DRAFT -> PENDING. Ownership is part of
  // the lookup, so another student's stage is a 404, never a 403.
  async submit(userId: string, stageId: string): Promise<StageDetailResponse> {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, student: { userId } },
      include: {
        periods: true,
        organism: true,
        tutor: true,
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!stage) {
      throw new NotFoundException("Demande de stage introuvable");
    }
    if (stage.status !== "DRAFT") {
      throw new ConflictException("Seul un brouillon peut être soumis");
    }

    // The same function the web uses to disable "Soumettre": the UI hint and
    // the server-side enforcement cannot drift apart.
    const blockers = getSubmissionBlockers({
      profileStatus: stage.student.profileStatus,
      hasOrganism: stage.organism !== null,
      hasTutor: stage.tutor !== null,
      service: stage.service,
      projectType: stage.projectType,
      motivation: stage.motivation,
      periods: stage.periods,
    });
    if (blockers.length > 0) {
      throw new BadRequestException(blockers);
    }

    // BR-09: a single conditional write. Matching on status and the version we
    // just read means a double submit, or any concurrent write to this stage,
    // updates zero rows instead of silently overwriting.
    const { count } = await this.prisma.stage.updateMany({
      where: { id: stage.id, status: "DRAFT", version: stage.version },
      data: { status: "PENDING", submittedAt: new Date(), version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictException(
        "Cette demande a été modifiée entre-temps. Rechargez la page et réessayez.",
      );
    }

    await this.notifyAdminsOfSubmission(stage);

    return this.getById(userId, stageId);
  }

  // BR-07. Runs after the transition committed, so nothing here may fail the
  // request: (ADR-0026) a failed send is logged by MailerService.sendSafely(),
  // and the admin lookup is guarded the same way. Otherwise a transient error
  // would answer 500 for a stage that is already PENDING, and the student's
  // retry would hit a confusing 409.
  private async notifyAdminsOfSubmission(stage: {
    schoolYear: string;
    semester: string;
    organism: { name: string } | null;
    student: { user: { firstName: string; lastName: string } };
  }): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { roles: { has: "ADMIN" } },
        select: { email: true },
      });
      if (admins.length === 0) {
        this.logger.warn("A stage request was submitted but no ADMIN user exists to notify");
        return;
      }

      const { firstName, lastName } = stage.student.user;
      const subject = "Nouvelle demande de stage à traiter";
      const text = `${firstName} ${lastName} a soumis une demande de stage auprès de ${stage.organism?.name ?? "un organisme"} (${stage.schoolYear}, ${stage.semester}).\n\nConnectez-vous à l'application pour la valider ou la refuser.`;

      for (const admin of admins) {
        await this.mailerService.sendSafely(
          { to: { email: admin.email }, subject, text },
          this.logger,
        );
      }
    } catch (error) {
      this.logger.error(
        "Failed to notify admins of a submission",
        error instanceof Error ? error.stack : error,
      );
    }
  }

  // Orders the list in three blocks, each with its own rule:
  //   1. stages with a period still ahead, nearest upcoming start first: what a
  //      student cares about most, so it must not be buried under old stages;
  //   2. stages entirely in the past, most recent start first;
  //   3. stages without any period (not creatable today), last.
  // A stage counts as upcoming while any of its periods starts today or later,
  // and is ranked by that nearest period. Within a block the database order
  // (submission date, newest first) is kept for ties, as Array#sort is stable.
  private sortByNearestStart(stages: StageListItemResponse[]): StageListItemResponse[] {
    const startOfTodayTime = startOfTodayUtc();

    const upcomingStages: RankedStage[] = [];
    const pastStages: RankedStage[] = [];
    const stagesWithoutPeriod: StageListItemResponse[] = [];

    for (const stage of stages) {
      const startTimes = stage.periods.map((period) => Date.parse(period.startDate));
      if (startTimes.length === 0) {
        stagesWithoutPeriod.push(stage);
        continue;
      }

      const upcomingStartTimes = startTimes.filter((startTime) => startTime >= startOfTodayTime);
      if (upcomingStartTimes.length > 0) {
        upcomingStages.push({ stage, rankingStartTime: Math.min(...upcomingStartTimes) });
      } else {
        pastStages.push({ stage, rankingStartTime: Math.max(...startTimes) });
      }
    }

    const nearestFirst = upcomingStages.sort(
      (earlier, later) => earlier.rankingStartTime - later.rankingStartTime,
    );
    const mostRecentFirst = pastStages.sort(
      (earlier, later) => later.rankingStartTime - earlier.rankingStartTime,
    );

    return [
      ...nearestFirst.map(({ stage }) => stage),
      ...mostRecentFirst.map(({ stage }) => stage),
      ...stagesWithoutPeriod,
    ];
  }

  private toListItem(
    stage: Prisma.StageGetPayload<{
      include: { periods: true; organism: { select: { name: true } } };
    }>,
  ): StageListItemResponse {
    const live = stage.status === "DRAFT" || stage.status === "PENDING";
    return {
      id: stage.id,
      status: stage.status,
      schoolYear: stage.schoolYear,
      semester: stage.semester,
      mandatory: stage.mandatory,
      organismName: live ? (stage.organism?.name ?? null) : null,
      submittedAt: stage.submittedAt?.toISOString() ?? null,
      periods: stage.periods.map((period) => this.toPeriodResponse(period)),
    };
  }

  private versionConflict(): ConflictException {
    return stageConflict(
      STAGE_CONFLICT_CODES.VERSION_CONFLICT,
      "Cette demande a été modifiée entre-temps. Rechargez la page pour la modifier.",
    );
  }

  // The freeze is derived, never stored (ADR-0032): a row is frozen as soon as
  // any stage other than this student's own DRAFTs references it. Deriving it
  // on read means both triggers (a second student's DRAFT, a referencing stage
  // leaving DRAFT) hold without any transition code to keep in sync.
  private async isFrozen(
    client: Tx,
    reference: { organismId: string } | { tutorId: string },
    studentId: string,
  ): Promise<boolean> {
    const others = await client.stage.count({
      where: { ...reference, NOT: { status: "DRAFT", studentId } },
    });
    return others > 0;
  }

  private async loadEditable(
    client: Tx,
    stage: { status: string; studentId: string; organismId: string | null; tutorId: string | null },
  ): Promise<EditableFlags> {
    if (stage.status !== "DRAFT") {
      return { organism: false, tutor: false };
    }
    const [organismFrozen, tutorFrozen] = await Promise.all([
      stage.organismId === null ||
        this.isFrozen(client, { organismId: stage.organismId }, stage.studentId),
      stage.tutorId === null || this.isFrozen(client, { tutorId: stage.tutorId }, stage.studentId),
    ]);
    return { organism: !organismFrozen, tutor: !tutorFrozen };
  }

  // `edit` corrects the row the draft already points to and nothing else: it is
  // what makes "referenced only by this student's own DRAFTs" non-vacuous (an
  // unreferenced row would otherwise pass the freeze check for anyone).
  private async resolveOrganismForUpdate(
    tx: Tx,
    stage: { organismId: string | null; studentId: string },
    organism: UpdateStageDraftRequest["organism"],
  ): Promise<string> {
    if (organism.mode !== "edit") {
      return this.resolveOrganism(tx, organism);
    }
    if (organism.id !== stage.organismId) {
      throw new BadRequestException("Seul l'organisme de cette demande peut être modifié");
    }
    if (await this.isFrozen(tx, { organismId: organism.id }, stage.studentId)) {
      throw stageConflict(
        STAGE_CONFLICT_CODES.ROW_FROZEN,
        "Cet organisme est utilisé par d'autres demandes: créez-en un nouveau plutôt que de le modifier.",
      );
    }
    const updated = await tx.hostOrganism.update({
      where: { id: organism.id },
      data: organism.data,
    });
    return updated.id;
  }

  private async resolveTutorForUpdate(
    tx: Tx,
    stage: { tutorId: string | null; studentId: string },
    tutor: UpdateStageDraftRequest["tutor"],
    organismId: string,
  ): Promise<string> {
    if (tutor.mode !== "edit") {
      return this.resolveTutor(tx, tutor, organismId);
    }
    if (tutor.id !== stage.tutorId) {
      throw new BadRequestException("Seul le tuteur de cette demande peut être modifié");
    }
    const owned = await tx.tutor.findFirst({ where: { id: tutor.id, organismId } });
    if (!owned) {
      throw new BadRequestException("Le tuteur sélectionné n'appartient pas à cet organisme");
    }
    if (await this.isFrozen(tx, { tutorId: tutor.id }, stage.studentId)) {
      throw stageConflict(
        STAGE_CONFLICT_CODES.ROW_FROZEN,
        "Ce tuteur est utilisé par d'autres demandes: créez-en un nouveau plutôt que de le modifier.",
      );
    }
    const updated = await tx.tutor.update({ where: { id: tutor.id }, data: tutor.data });
    return updated.id;
  }

  private toPeriodResponse(period: {
    id: string;
    startDate: Date;
    endDate: Date;
  }): StageDraftPeriodResponse {
    return {
      id: period.id,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
    };
  }

  private async resolveOrganism(
    tx: Tx,
    organism: CreateStageDraftRequest["organism"],
  ): Promise<string> {
    if (organism.mode === "existing") {
      const found = await tx.hostOrganism.findUnique({ where: { id: organism.id } });
      if (!found) {
        throw new NotFoundException("Organisme introuvable");
      }
      return found.id;
    }

    try {
      const created = await tx.hostOrganism.create({ data: organism.data });
      return created.id;
    } catch (error) {
      this.logger.error(
        "Inline organism creation failed",
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        "Impossible de créer l'organisme. Le brouillon n'a pas été enregistré.",
      );
    }
  }

  private async resolveTutor(
    tx: Tx,
    tutor: CreateStageDraftRequest["tutor"],
    organismId: string,
  ): Promise<string> {
    if (tutor.mode === "existing") {
      const found = await tx.tutor.findFirst({ where: { id: tutor.id, organismId } });
      if (!found) {
        throw new BadRequestException("Le tuteur sélectionné n'appartient pas à cet organisme");
      }
      return found.id;
    }

    try {
      const created = await tx.tutor.create({ data: { ...tutor.data, organismId } });
      return created.id;
    } catch (error) {
      this.logger.error(
        "Inline tutor creation failed",
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        "Impossible de créer le tuteur. Le brouillon n'a pas été enregistré.",
      );
    }
  }

  private toResponse(
    stage: Prisma.StageGetPayload<{ include: { periods: true; organism: true; tutor: true } }>,
    editable: EditableFlags,
  ): StageDraftResponse {
    return {
      id: stage.id,
      status: stage.status,
      version: stage.version,
      schoolYear: stage.schoolYear,
      semester: stage.semester,
      mandatory: stage.mandatory,
      service: stage.service,
      projectType: stage.projectType,
      motivation: stage.motivation,
      // Always set at this point: resolveOrganism/resolveTutor either find
      // an existing row or create one, always returning a real relation.
      organism: {
        id: stage.organism!.id,
        name: stage.organism!.name,
        structureType: stage.organism!.structureType,
        city: stage.organism!.city,
        postalCode: stage.organism!.postalCode,
        street: stage.organism!.street,
        editable: editable.organism,
      },
      tutor: {
        id: stage.tutor!.id,
        firstName: stage.tutor!.firstName,
        lastName: stage.tutor!.lastName,
        email: stage.tutor!.email,
        jobTitle: stage.tutor!.jobTitle,
        phone: stage.tutor!.phone,
        acceptsPhoneContact: stage.tutor!.acceptsPhoneContact,
        editable: editable.tutor,
      },
      periods: stage.periods.map((period) => this.toPeriodResponse(period)),
    };
  }
}
