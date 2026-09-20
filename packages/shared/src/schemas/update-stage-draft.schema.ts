import { z } from "zod";
import { hostOrganismInputSchema, tutorInputSchema } from "./create-stage-draft.schema";
import { stagePeriodsSchema } from "./stage-period.schema";

// Issue #116. Same three-way choice as creation plus `edit`: correct the row
// the draft already points to, in place. The server only honours it while the
// row is unfrozen (referenced by this student's own DRAFT stages only).
const existingNewOrEditSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().uuid() }),
    z.object({ mode: z.literal("new"), data: dataSchema }),
    z.object({ mode: z.literal("edit"), id: z.string().uuid(), data: dataSchema }),
  ]);

// PATCH /stages/:id replaces the wizard's whole content: it always carries
// every wizard field, and an absent service/projectType/motivation clears it,
// so a student can empty a field they filled earlier. As with creation there is
// no `semester` (BR-04b, it is re-derived from the periods), and `version` is
// mandatory (BR-09): the write only succeeds if the draft is still at it.
export const updateStageDraftSchema = z.object({
  version: z.number().int().nonnegative(),
  organism: existingNewOrEditSchema(hostOrganismInputSchema),
  tutor: existingNewOrEditSchema(tutorInputSchema),
  periods: stagePeriodsSchema,
  service: z.string().trim().min(1).optional(),
  projectType: z.string().trim().min(1).optional(),
  motivation: z.string().trim().min(1).optional(),
  mandatory: z.boolean(),
});

export type UpdateStageDraftInput = z.infer<typeof updateStageDraftSchema>;
