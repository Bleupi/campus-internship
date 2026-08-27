import type { z } from "zod";
import type { FileType, ProfileStatus, Promotion } from "../enums";
import type { updateProfileSchema } from "../schemas/update-profile.schema";

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

// No download/preview in V1 (ROADMAP_V2) — metadata only, never bucketKey.
export interface StudentFileMetadata {
  type: FileType;
  mimeType: string;
  uploadedAt: string;
}

export interface StudentProfileResponse {
  promotion: Promotion | null;
  phone: string | null;
  personalEmail: string | null;
  profileStatus: ProfileStatus;
  profileYear: string | null;
  files: StudentFileMetadata[];
}

export type GetProfileResponse = StudentProfileResponse;
export type UpdateProfileResponse = StudentProfileResponse;
export type UploadFileResponse = StudentProfileResponse;
