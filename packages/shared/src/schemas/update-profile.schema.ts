import { z } from "zod";
import { PROMOTIONS } from "../enums";
import { frenchMobilePhoneSchema } from "./phone.schema";
import { STUDENT_EMAIL_DOMAIN } from "./university-email.schema";

// Partial patch: every field is optional and only sent keys are applied by
// the service. `promotion`'s VALUE (not its mere presence) is what the
// service diffs against the stored value to decide whether it "changed".
export const updateProfileSchema = z.object({
  promotion: z.enum(PROMOTIONS).optional(),
  phone: frenchMobilePhoneSchema.nullable().optional(),
  personalEmail: z
    .string()
    .trim()
    .email()
    .nullable()
    .optional()
    .refine((value) => value == null || !value.toLowerCase().endsWith(STUDENT_EMAIL_DOMAIN), {
      message: `Utilisez une adresse email personnelle, différente de votre adresse universitaire (${STUDENT_EMAIL_DOMAIN})`,
    }),
});
