import { z } from "zod";
import { PROMOTIONS } from "../enums";

// Partial patch: every field is optional and only sent keys are applied by
// the service. `promotion`'s VALUE (not its mere presence) is what the
// service diffs against the stored value to decide whether it "changed".
export const updateProfileSchema = z.object({
  promotion: z.enum(PROMOTIONS).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  personalEmail: z.string().trim().email().nullable().optional(),
});
