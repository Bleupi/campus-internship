import { z } from "zod";

export const envSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
  })
  // Nest's ConfigModule only reassigns this schema's *own* output back onto
  // process.env when `validate` is set (see ConfigModule.assignVariablesToProcess).
  // Without passthrough, every var not declared here (DATABASE_URL, JWT_SECRET,
  // S3_*, ...) would be silently dropped from process.env — breaking anything
  // that reads it directly, like Prisma's `env("DATABASE_URL")`.
  .passthrough();

export type Env = z.infer<typeof envSchema>;
