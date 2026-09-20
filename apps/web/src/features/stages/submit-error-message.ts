import { ApiError } from "../../lib/api-client";

// ApiError.message is the raw response body, so it is never shown as is:
// each status the submit endpoint can answer gets its own French sentence.
export function describeSubmitError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Cette demande a déjà été soumise ou modifiée.";
  }
  if (error instanceof ApiError && error.status === 400) {
    return "La demande est incomplète ou votre profil n'est pas validé.";
  }
  return "La demande n'a pas pu être soumise. Réessayez.";
}

// Shown when the draft itself was saved but the submission that followed failed.
export function describeDraftSavedButNotSubmitted(error: unknown): string {
  return `Votre brouillon a bien été enregistré, mais il n'a pas été soumis. ${describeSubmitError(error)} Vous pouvez le retrouver dans « Mes demandes ».`;
}
