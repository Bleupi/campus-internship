export const ROLES = ["STUDENT", "ADMIN", "REFERENT"] as const;

export type Role = (typeof ROLES)[number];
