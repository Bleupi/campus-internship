import type { Readable } from "node:stream";
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AdminProfileTransitionResponse, FileType, ProfileStatus } from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { currentFileFilter } from "../files/current-file.util";
import { FilesService } from "../files/files.service";
import { MailerService } from "../mailer/mailer.service";

const VALIDATABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION"];
const REJECTABLE_STATUSES: ProfileStatus[] = ["PENDING_VALIDATION", "VALID"];
const CERTIFICATE_TYPE = "INSURANCE_CERTIFICATE" satisfies FileType;

// TODO(#67 follow-up, see docs/ROADMAP_V2.md "Admin function/title as a
// field"): hardcoded because there is a single admin today. Move this to a
// real field on the acting admin before a second admin is onboarded, so we
// never silently email a student the wrong title.
const ADMIN_TITLE = "responsable de stages L2 et L3 APA-S";

interface ActingAdmin {
  firstName: string;
  lastName: string;
}

// BR-11: "NOM Prénom" — last name uppercased, first name as stored, space
// separated, no comma. Used identically in the body mention and the
// signature; only the body mention also carries ADMIN_TITLE.
function adminDisplayName(admin: ActingAdmin): string {
  return `${admin.lastName.toUpperCase()} ${admin.firstName}`;
}

@Injectable()
export class AdminStudentsService {
  private readonly logger = new Logger(AdminStudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly mailerService: MailerService,
  ) {}

  // ADR-0004: PENDING_VALIDATION -> VALID. The source-status check is part of
  // the `updateMany` WHERE clause (not a separate read-then-write) so two
  // concurrent admin actions on the same profile can't both pass a
  // stale in-memory check and race each other to a silent last-write-wins.
  async validateProfile(
    studentId: string,
    admin: ActingAdmin,
  ): Promise<AdminProfileTransitionResponse> {
    const { count } = await this.prisma.studentProfile.updateMany({
      where: { id: studentId, profileStatus: { in: VALIDATABLE_STATUSES } },
      // Issue #66: a direct validation also leaves the rejected state (in the
      // rare case a stale reason is still on file), so it's cleared here too
      // — not just on student resubmission.
      data: { profileStatus: "VALID" satisfies ProfileStatus, refusalReason: null },
    });
    if (count === 0) {
      await this.throwForFailedTransition(studentId, "valider");
    }

    const profile = await this.getNotificationTarget(studentId);
    const adminName = adminDisplayName(admin);
    await this.notifyStudent(
      profile,
      "Votre profil a été validé",
      this.composeEmail(
        profile.user.firstName,
        adminName,
        `Votre attestation d'assurance de responsabilité civile avec mention stage a été vérifiée et votre profil de stage est validé par ${adminName}, ${ADMIN_TITLE}.`,
        "Vous pouvez le consulter à tout moment depuis votre espace étudiant.",
      ),
    );
    return { studentId, profileStatus: "VALID" };
  }

  // ADR-0004: PENDING_VALIDATION or VALID -> INCOMPLETE, with a reason.
  async rejectProfile(
    studentId: string,
    reason: string,
    admin: ActingAdmin,
  ): Promise<AdminProfileTransitionResponse> {
    const { count } = await this.prisma.studentProfile.updateMany({
      where: { id: studentId, profileStatus: { in: REJECTABLE_STATUSES } },
      // Issue #66: latest reason only, persisted on the profile (not just
      // the notification email) so the student sees it on their page.
      data: { profileStatus: "INCOMPLETE" satisfies ProfileStatus, refusalReason: reason },
    });
    if (count === 0) {
      await this.throwForFailedTransition(studentId, "rejeter");
    }

    const profile = await this.getNotificationTarget(studentId);
    const adminName = adminDisplayName(admin);
    await this.notifyStudent(
      profile,
      "Votre profil a été refusé",
      this.composeEmail(
        profile.user.firstName,
        adminName,
        `Votre profil de stage a été examiné par ${adminName}, ${ADMIN_TITLE}, et n'a pas pu être validé, pour le motif suivant :\n\n${reason}`,
        "Merci de mettre à jour votre profil et de soumettre à nouveau votre attestation de responsabilité civile scolaire avec mention stage depuis votre espace étudiant.",
      ),
    );
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
      throw new NotFoundException(
        "Aucune attestation de responsabilité civile scolaire actuelle pour cet étudiant",
      );
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

  // Shared by validateProfile/rejectProfile — both need the same recipient
  // shape for notifyStudent() right after their own transition-specific
  // updateMany/throwForFailedTransition.
  private async getNotificationTarget(
    studentId: string,
  ): Promise<{ personalEmail: string | null; user: { email: string; firstName: string } }> {
    return this.prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { personalEmail: true, user: { select: { email: true, firstName: true } } },
    });
  }

  // Shared plain-text structure for every student-facing email: a
  // personalized greeting, one or more body paragraphs (the reason, for a
  // refusal, is just another paragraph — never the whole message on its
  // own), and a signature. Kept in the caller (not MailerService, which
  // stays content-agnostic per ADR-0026) since deciding what a notification
  // says is business logic, not transport. BR-11: the signature is the
  // acting admin's "NOM Prénom" only — never their function/title, which
  // (when present) is confined to a body paragraph instead.
  private composeEmail(
    studentFirstName: string,
    signatureName: string,
    ...paragraphs: string[]
  ): string {
    return [`Bonjour ${studentFirstName},`, ...paragraphs, `Cordialement,\n${signatureName}`].join(
      "\n\n",
    );
  }

  // BR-11: the student is notified by real email on validation/refusal — to
  // their university address always, and cc'd to their personal address
  // when one is on file. A refusal email's text already carries the reason
  // (built by the caller). MailerService.sendSafely() owns the shared
  // "catch, log, don't propagate" policy (ADR-0026): by this point the
  // status transition already committed, and this project builds no in-app
  // delivery-failure handling — a failed send is diagnosed via Scaleway's
  // own activity dashboard, not by turning an already-successful admin
  // action into a 500.
  private async notifyStudent(
    profile: { personalEmail: string | null; user: { email: string } },
    subject: string,
    text: string,
  ): Promise<void> {
    await this.mailerService.sendSafely(
      {
        to: { email: profile.user.email },
        cc: profile.personalEmail ? { email: profile.personalEmail } : undefined,
        subject,
        text,
      },
      this.logger,
    );
  }
}
