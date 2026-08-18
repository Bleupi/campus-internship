export const PROFILE_STATUSES = ["INCOMPLETE", "PENDING_VALIDATION", "VALID", "EXPIRED"] as const;

export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
