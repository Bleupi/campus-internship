import { z } from "zod";

// Issue #151 (BR-03, BR-09): refusing a PENDING stage requires the version
// it was read at (optimistic locking) and a non-empty reason. The web builds
// one string from its hard-coded recurring reasons + free text (like
// reject-reason.ts does for certificate rejection) — the API only ever sees
// the final string, never the individual reasons.
export const refuseStageSchema = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().trim().min(1),
});
