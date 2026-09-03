import type { Readable } from "node:stream";
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AdminProfileTransitionResponse, FileType, ProfileStatus } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { currentFileFilter } from "../files/current-file.util";
import { FilesService } from "../files/files.service";

const VALIDATABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION"];
const REJECTABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION", "VALID"];
const CERTIFICATE_TYPE = "INSURANCE_CERTIFICATE" satisfies FileType;

@Injectable()
export class AdminStudentsService {
  private readonly logger = new Logger(AdminStudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

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

  // Issue #43 / ADR-0024: proxy the current non-expired certificate through
  // this service rather than handing out a presigned URL, so every access
  // still goes through JwtAuthGuard + RolesGuard(ADMIN). Same "current file"
  // semantics as StudentsService.currentFiles(): most recent non-expired row
  // of this type, if any.
  async getCertificateStream(studentId: string): Promise<{ stream: Readable; mimeType: string }> {
    const file = await this.prisma.fileObject.findFirst({
      where: { studentProfileId: studentId, type: CERTIFICATE_TYPE, ...currentFileFilter() },
      orderBy: { uploadedAt: "desc" },
    });
    if (!file) {
      throw new NotFoundException("Aucun certificat d'assurance actuel pour cet étudiant");
    }

    const stream = await this.filesService.download(file.bucketKey);
    return { stream, mimeType: file.mimeType };
  }

  // Only reached when the conditional updateMany above matched zero rows —
  // distinguishes "no such profile" (404) from "wrong status for this
  // action" (409) without a redundant read on the success path.
  //
  // `action` is a French infinitive, inserted as-is into the error message
  // below ("Impossible de <action> un profil..."); the union keeps it to the
  // two verbs the current transitions actually use.
  private async throwForFailedTransition(
    studentId: string,
    action: "valider" | "rejeter",
  ): Promise<never> {
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
