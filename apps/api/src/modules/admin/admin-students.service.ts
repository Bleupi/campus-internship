import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AdminProfileTransitionResponse, ProfileStatus } from "shared";
import { PrismaService } from "../../prisma/prisma.service";

const VALIDATABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION"];
const REJECTABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION", "VALID"];

@Injectable()
export class AdminStudentsService {
  private readonly logger = new Logger(AdminStudentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ADR-0004: PENDING_VALIDATION -> VALID. The source-status check is part of
  // the `updateMany` WHERE clause (not a separate read-then-write) so two
  // concurrent admin actions on the same profile can't both pass a
  // stale in-memory check and race each other to a silent last-write-wins.
  async validateProfile(studentId: string): Promise<AdminProfileTransitionResponse> {
    const { count } = await this.prisma.studentProfile.updateMany({
      where: { id: studentId, profileStatus: { in: VALIDATABLE_STATUSES } },
      data: { profileStatus: "VALID" satisfies ProfileStatus },
    });
    if (count === 0) {
      await this.throwForFailedTransition(studentId, "valider");
    }

    const { userId } = await this.prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { userId: true },
    });
    this.notifyStudent(userId, "Votre certificat d'assurance a été validé.");
    return { studentId, profileStatus: "VALID" };
  }

  // ADR-0004: PENDING_VALIDATION or VALID -> INCOMPLETE, with a reason.
  async rejectProfile(studentId: string, reason: string): Promise<AdminProfileTransitionResponse> {
    const { count } = await this.prisma.studentProfile.updateMany({
      where: { id: studentId, profileStatus: { in: REJECTABLE_STATUSES } },
      data: { profileStatus: "INCOMPLETE" satisfies ProfileStatus },
    });
    if (count === 0) {
      await this.throwForFailedTransition(studentId, "rejeter");
    }

    const { userId } = await this.prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { userId: true },
    });
    this.notifyStudent(userId, `Votre profil a été rejeté : ${reason}`);
    return { studentId, profileStatus: "INCOMPLETE" };
  }

  // Only reached when the conditional updateMany above matched zero rows —
  // distinguishes "no such profile" (404) from "wrong status for this
  // action" (409) without a redundant read on the success path.
  private async throwForFailedTransition(studentId: string, action: string): Promise<never> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { id: studentId } });
    if (!profile) {
      throw new NotFoundException("Profil étudiant introuvable");
    }
    throw new ConflictException(
      `Impossible de ${action} un profil au statut ${profile.profileStatus}`,
    );
  }

  // BR-07: the student is notified on validation/refusal, and a refusal
  // notification must include the reason. No notification subsystem
  // (mailer, queue, ...) exists yet in this codebase — logged as a stub per
  // issue #13 scope; building one is a separate ticket.
  private notifyStudent(userId: string, message: string): void {
    this.logger.log(`Notifying student user ${userId}: ${message}`);
  }
}
