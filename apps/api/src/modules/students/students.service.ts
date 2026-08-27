import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { FileObject, StudentProfile } from "@prisma/client";
import {
  getCurrentSchoolYear,
  type FileType,
  type ProfileStatus,
  type StudentProfileResponse,
} from "shared";
import { PrismaService } from "../../prisma/prisma.service";
import { FilesService } from "../files/files.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async getProfile(userId: string): Promise<StudentProfileResponse> {
    const profile = await this.findProfileOrThrow(userId);
    const files = await this.currentFiles(profile.id);
    return this.toResponse(profile, files);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<StudentProfileResponse> {
    const profile = await this.findProfileOrThrow(userId);
    const files = await this.currentFiles(profile.id);

    const newPromotion = dto.promotion !== undefined ? dto.promotion : profile.promotion;

    const data: Record<string, unknown> = {};
    if (dto.promotion !== undefined) data.promotion = dto.promotion;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.personalEmail !== undefined) data.personalEmail = dto.personalEmail;

    this.applyStatusTransition(data, profile, files, { type: "profile-update", newPromotion });

    const updated = await this.prisma.studentProfile.update({ where: { id: profile.id }, data });
    return this.toResponse(updated, files);
  }

  async uploadFile(
    userId: string,
    type: FileType,
    file: Express.Multer.File,
  ): Promise<StudentProfileResponse> {
    const profile = await this.findProfileOrThrow(userId);

    const bucketKey = `students/${profile.id}/${type}/${randomUUID()}`;
    await this.filesService.upload(bucketKey, file.buffer, file.mimetype);

    await this.prisma.fileObject.create({
      data: {
        type,
        bucketKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        // Expiry tied to school-year rollover is #12/BR-06's job — left null
        // here, so "most recent non-expired" is just "most recent" for now.
        expiresAt: null,
        studentProfileId: profile.id,
      },
    });

    const files = await this.currentFiles(profile.id);

    const data: Record<string, unknown> = {};
    this.applyStatusTransition(data, profile, files, { type: "file-upload", fileType: type });

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.studentProfile.update({ where: { id: profile.id }, data })
        : profile;

    return this.toResponse(updated, files);
  }

  // Each call site only knows "what just happened" (a profile edit with its
  // candidate promotion, or a file upload of a given type) — hasIdPhoto/
  // hasCertificate/promotionChanged/certificateReuploaded are derived here
  // instead of being recomputed identically by every caller.
  private applyStatusTransition(
    data: Record<string, unknown>,
    profile: Pick<StudentProfile, "profileStatus" | "promotion">,
    files: FileObject[],
    event:
      | { type: "profile-update"; newPromotion: string | null }
      | { type: "file-upload"; fileType: FileType },
  ): void {
    const hasIdPhoto = this.hasFileOfType(files, "ID_PHOTO");
    const hasCertificate = this.hasFileOfType(files, "INSURANCE_CERTIFICATE");
    const promotionChanged =
      event.type === "profile-update" && event.newPromotion !== profile.promotion;
    const certificateReuploaded =
      event.type === "file-upload" && event.fileType === "INSURANCE_CERTIFICATE";
    const newPromotion = event.type === "profile-update" ? event.newPromotion : profile.promotion;

    const next = this.nextStatus(
      { profileStatus: profile.profileStatus as ProfileStatus, promotion: newPromotion },
      hasIdPhoto,
      hasCertificate,
      promotionChanged,
      certificateReuploaded,
    );

    if (next === profile.profileStatus) return;

    data.profileStatus = next;
    if (profile.profileStatus === "INCOMPLETE" && next === "PENDING_VALIDATION") {
      data.profileYear = getCurrentSchoolYear();
    }
  }

  // BR-04b-style derivation for ProfileStatus: pure decision, no I/O.
  private nextStatus(
    current: { profileStatus: ProfileStatus; promotion: string | null },
    hasIdPhoto: boolean,
    hasCertificate: boolean,
    promotionChanged: boolean,
    certificateReuploaded: boolean,
  ): ProfileStatus {
    if (current.profileStatus === "INCOMPLETE") {
      if (current.promotion !== null && hasIdPhoto && hasCertificate) {
        return "PENDING_VALIDATION";
      }
      return "INCOMPLETE";
    }

    if (current.profileStatus === "VALID" && (promotionChanged || certificateReuploaded)) {
      return "PENDING_VALIDATION";
    }

    return current.profileStatus;
  }

  private hasFileOfType(files: FileObject[], type: FileType): boolean {
    return files.some((file) => file.type === type);
  }

  // Decision 5: the current file per type is the most recent non-expired
  // one, never the full history.
  private async currentFiles(studentProfileId: string): Promise<FileObject[]> {
    const files = await this.prisma.fileObject.findMany({
      where: {
        studentProfileId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { uploadedAt: "desc" },
    });

    const currentByType = new Map<string, FileObject>();
    for (const file of files) {
      if (!currentByType.has(file.type)) {
        currentByType.set(file.type, file);
      }
    }
    return [...currentByType.values()];
  }

  private async findProfileOrThrow(userId: string): Promise<StudentProfile> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("Profil étudiant introuvable");
    }
    return profile;
  }

  // Decision 4: metadata only — type/mimeType/uploadedAt, never bucketKey.
  private toResponse(profile: StudentProfile, files: FileObject[]): StudentProfileResponse {
    return {
      promotion: profile.promotion as StudentProfileResponse["promotion"],
      phone: profile.phone,
      personalEmail: profile.personalEmail,
      profileStatus: profile.profileStatus as ProfileStatus,
      profileYear: profile.profileYear,
      files: files.map((file) => ({
        type: file.type as FileType,
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt.toISOString(),
      })),
    };
  }
}
