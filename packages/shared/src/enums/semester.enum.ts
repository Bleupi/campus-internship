export const SEMESTERS = ["S1", "S2"] as const;

export type Semester = (typeof SEMESTERS)[number];
