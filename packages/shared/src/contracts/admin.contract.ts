import type { z } from "zod";
import type { ProfileStatus } from "../enums";
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
