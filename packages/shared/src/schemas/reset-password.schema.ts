import { z } from "zod";
import { passwordSchema } from "./password.schema";

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
