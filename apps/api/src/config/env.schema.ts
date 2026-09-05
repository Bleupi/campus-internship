import { z } from "zod";

export const envSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    JWT_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default("15m"),
    JWT_REFRESH_TTL: z.string().default("7d"),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default("fr-par"),
    S3_BUCKET: z.string(),
    S3_ACCESS_KEY_ID: z.string(),
    S3_SECRET_ACCESS_KEY: z.string(),
    // "true"/"false" string, not z.coerce.boolean() — coerce treats any
    // non-empty string (including "false") as true.
    S3_FORCE_PATH_STYLE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    // Scaleway Transactional Email (ADR-0026) — region is fixed (fr-par is
    // currently the only one Scaleway TEM offers), so only credentials and
    // the verified sender identity are configurable.
    MAILER_SCW_SECRET_KEY: z.string(),
    MAILER_SCW_PROJECT_ID: z.string(),
    MAILER_FROM_EMAIL: z.string().email(),
    MAILER_FROM_NAME: z.string().default("Gestion des stages"),
  })
  // Nest's ConfigModule only reassigns this schema's *own* output back onto
  // process.env when `validate` is set (see ConfigModule.assignVariablesToProcess).
  // Without passthrough, every var not declared here (DATABASE_URL, JWT_SECRET,
  // S3_*, ...) would be silently dropped from process.env — breaking anything
  // that reads it directly, like Prisma's `env("DATABASE_URL")`.
  .passthrough();

export type Env = z.infer<typeof envSchema>;
