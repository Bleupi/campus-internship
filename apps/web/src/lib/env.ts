import { z } from "zod";

export function readEnvVar<T>(value: string | undefined, name: string, schema: z.ZodType<T>): T {
  const trimmed = value?.trim();
  const result = schema.safeParse(trimmed);

  if (!result.success) {
    const reason = result.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(`Invalid environment variable "${name}": ${reason}`);
  }

  return result.data;
}
