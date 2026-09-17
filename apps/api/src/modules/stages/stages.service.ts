import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  deriveSemester,
  getCurrentSchoolYear,
  type CreateStageDraftRequest,
  type StageDraftResponse,
} from "shared";
import { PrismaService } from "../../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

@Injectable()
export class StagesService {
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

    const created = await tx.hostOrganism.create({ data: organism.data });
    return created.id;
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

    const created = await tx.tutor.create({ data: { ...tutor.data, organismId } });
    return created.id;
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
      periods: stage.periods.map((period) => ({
        id: period.id,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      })),
    };
  }
}
