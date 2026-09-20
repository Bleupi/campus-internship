import {
  BadRequestException,
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
  type CreateStageDraftRequest,
  type ListStagesQuery,
  type StageDetailResponse,
  type StageDraftPeriodResponse,
  type StageDraftResponse,
  type StageListItemResponse,
} from "shared";
import { PrismaService } from "../../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

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

  constructor(private readonly prisma: PrismaService) {}

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

    return this.toResponse(stage);
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
      ...this.toResponse(stage),
      submittedAt: stage.submittedAt?.toISOString() ?? null,
      refusalReason: stage.refusalReason,
      referent: assignment && {
        id: assignment.referent.id,
        firstName: assignment.referent.user.firstName,
        lastName: assignment.referent.user.lastName,
      },
    };
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
  ): StageDraftResponse {
    return {
      id: stage.id,
      status: stage.status,
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
      },
      tutor: {
        id: stage.tutor!.id,
        firstName: stage.tutor!.firstName,
        lastName: stage.tutor!.lastName,
        email: stage.tutor!.email,
        jobTitle: stage.tutor!.jobTitle,
        phone: stage.tutor!.phone,
        acceptsPhoneContact: stage.tutor!.acceptsPhoneContact,
      },
      periods: stage.periods.map((period) => this.toPeriodResponse(period)),
    };
  }
}
