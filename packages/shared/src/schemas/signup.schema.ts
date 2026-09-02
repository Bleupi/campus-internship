import { z } from "zod";
import { STUDENT_EMAIL_DOMAIN } from "./university-email.schema";

export const signupSchema = z.object({
  email: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith(STUDENT_EMAIL_DOMAIN), {
      message: `L'adresse email doit se terminer par ${STUDENT_EMAIL_DOMAIN}`,
    }),
  // Length-only policy (NIST 800-63B: length beats forced complexity rules).
  // max(72) matches bcrypt's hard input-byte limit — bcrypt silently
  // truncates anything past that, so longer input wouldn't be fully checked.
  password: z.string().min(18).max(72),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});
