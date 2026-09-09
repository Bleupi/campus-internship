import { z } from "zod";
import { passwordSchema } from "./password.schema";
import { STUDENT_EMAIL_DOMAIN } from "./university-email.schema";

export const signupSchema = z.object({
  email: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith(STUDENT_EMAIL_DOMAIN), {
      message: `L'adresse email doit se terminer par ${STUDENT_EMAIL_DOMAIN}`,
    }),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});
