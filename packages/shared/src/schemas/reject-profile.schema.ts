import { z } from "zod";

// Issue #13: reject requires a non-empty reason (BR-07 — the student
// notification must include it). Trimmed so whitespace-only input doesn't
// pass as a "reason".
export const rejectProfileSchema = z.object({
  reason: z.string().trim().min(1),
});
