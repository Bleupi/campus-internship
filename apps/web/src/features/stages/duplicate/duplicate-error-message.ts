import { ApiError } from "../../../lib/api-client";

// ApiError.message is the raw response body, so it is never shown as is.
export function describeDuplicateError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "Cette demande est introuvable.";
  }
  return "La demande n'a pas pu être dupliquée. Réessayez.";
}
