export const STAGE_STATUSES = ["DRAFT", "PENDING", "VALIDATED", "REFUSED"] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];
