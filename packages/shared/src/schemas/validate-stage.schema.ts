import { z } from "zod";

// Issue #152 (BR-09): validating a PENDING stage requires the version it was
// read at (optimistic locking) — unlike refusal, there is no reason.
export const validateStageSchema = z.object({
  version: z.number().int().nonnegative(),
});
