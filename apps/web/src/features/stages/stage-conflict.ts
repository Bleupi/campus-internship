import { STAGE_CONFLICT_CODES, type StageConflictCode } from "shared";
import { ApiError } from "../../lib/api-client";

const KNOWN_CODES: readonly string[] = Object.values(STAGE_CONFLICT_CODES);

// ApiError.message is the raw response body. A stage 409 carries a `code` (a
// stale version and a frozen row need different answers from the wizard) and a
// French `message` written for the student, so unlike the submit endpoint's
// errors this one may be shown as is. Anything else, including a plain Nest
// conflict without a code, is not a stage conflict.
export function readStageConflict(
  error: unknown,
): { code: StageConflictCode; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  let body: unknown;
  try {
    body = JSON.parse(error.message);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;

  const { code, message } = body as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || !KNOWN_CODES.includes(code) || typeof message !== "string") {
    return null;
  }
  return { code: code as StageConflictCode, message };
}
