import { z } from "zod";
import { SEMESTERS } from "../enums/semester.enum";
import { STAGE_STATUSES } from "../enums/stage-status.enum";

// Query-string validation for GET /stages (issue #114). `startDate` sorts the
// nearest upcoming start first (the default); `submittedAt` sorts the most
// recently submitted first, drafts (never submitted) last.
export const STAGE_LIST_SORTS = ["startDate", "submittedAt"] as const;

export type StageListSort = (typeof STAGE_LIST_SORTS)[number];

export const listStagesQuerySchema = z.object({
  status: z.enum(STAGE_STATUSES).optional(),
  semester: z.enum(SEMESTERS).optional(),
  sort: z.enum(STAGE_LIST_SORTS).default("startDate"),
});

export type ListStagesQuery = z.infer<typeof listStagesQuerySchema>;
