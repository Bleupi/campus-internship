import type { z } from "zod";
import type { ProfileStatus, Promotion } from "../enums";
import type { rejectProfileSchema } from "../schemas/reject-profile.schema";

export type RejectProfileRequest = z.infer<typeof rejectProfileSchema>;

// Issue #13: admin-triggered ProfileStatus transitions only — no admin queue
// UI in this slice, so the response is just enough to confirm the transition
// (not the full StudentProfileResponse shape students.contract.ts uses).
export interface AdminProfileTransitionResponse {
  studentId: string;
  profileStatus: ProfileStatus;
}

export type ValidateProfileResponse = AdminProfileTransitionResponse;
export type RejectProfileResponse = AdminProfileTransitionResponse;

// Issue #42: queue-list slice of #41 (admin certificate-validation queue).
// Metadata only — no file bytes, that's ticket 2 (PDF proxy/stream).
export interface CertificateQueueEntry {
  studentId: string;
  firstName: string;
  lastName: string;
  promotion: Promotion | null;
  // Proxy for "waiting since": StudentProfile.updatedAt moves exactly when a
  // profile (re-)enters PENDING_VALIDATION (see StudentsService), so no new
  // column is needed to sort the queue FIFO. Known gap tracked in issue #46:
  // a cosmetic edit while already pending also bumps updatedAt.
  waitingSince: string;
  // null in the rare case a PENDING_VALIDATION profile's certificate expired
  // (BR-06 school-year boundary) before the lazy per-login rollover caught up.
  certificate: { uploadedAt: string } | null;
}

export type CertificateQueueResponse = CertificateQueueEntry[];
