import { Injectable } from "@nestjs/common";
import type { CertificateQueueResponse, FileType, ProfileStatus, Promotion } from "shared";
import { PrismaService } from "../../prisma/prisma.service";

const CERTIFICATE_TYPE = "INSURANCE_CERTIFICATE" satisfies FileType;

@Injectable()
export class AdminStudentsQueueService {
  constructor(private readonly prisma: PrismaService) {}

  // Issue #42: every PENDING_VALIDATION StudentProfile, oldest-updatedAt-first
  // (FIFO — updatedAt moves exactly when a profile (re-)enters this status,
  // see StudentsService, so no dedicated "waiting since" column is needed).
  // Known gap tracked separately (issue #46): a cosmetic profile edit while
  // already PENDING_VALIDATION also bumps updatedAt via StudentsService's
  // unconditional write, reordering the queue — accepted for now at this
  // feature's scale (~300 students / 15-day window).
  // No pagination at this scale (~300 rows). `id` is a pure tie-breaker for
  // deterministic ordering when two rows share the same updatedAt.
  async list(): Promise<CertificateQueueResponse> {
    const profiles = await this.prisma.studentProfile.findMany({
      where: { profileStatus: "PENDING_VALIDATION" satisfies ProfileStatus },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      include: {
        user: { select: { firstName: true, lastName: true } },
        // Same "current file" semantics as StudentsService.currentFiles():
        // most recent non-expired row of this type, if any.
        files: {
          where: {
            type: CERTIFICATE_TYPE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { uploadedAt: "desc" },
          take: 1,
        },
      },
    });

    return profiles.map((profile) => {
      const certificate = profile.files[0];
      return {
        studentId: profile.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        promotion: profile.promotion as Promotion | null,
        waitingSince: profile.updatedAt.toISOString(),
        certificate: certificate
          ? { uploadedAt: certificate.uploadedAt.toISOString(), mimeType: certificate.mimeType }
          : null,
      };
    });
  }
}
