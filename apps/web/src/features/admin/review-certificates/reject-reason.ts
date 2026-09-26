// Issue #43 / BR-10: canned reasons for the manual visual check on an
// INSURANCE_CERTIFICATE's content (see CONTEXT.md for the "stage
// conventionné"/school-year-coverage wording insurers phrase inconsistently).
export const REJECT_REASONS = [
  "Le document ne mentionne pas les stages",
  "Le document ne couvre pas l'année scolaire en cours",
  "Le document est illisible",
  "Le document n'est pas une attestation de responsabilité civile",
] as const;

// rejectProfileSchema (packages/shared) still expects a single `reason`
// string — checked canned reasons become bullets, free text (if any) becomes
// a trailing unbulleted "Autre précision : …" line, never a bullet itself.
export function buildRejectReason(checkedReasons: readonly string[], freeText: string): string {
  const lines = checkedReasons.map((reason) => `- ${reason}`);
  const trimmedFreeText = freeText.trim();
  if (trimmedFreeText.length > 0) {
    lines.push(`Autre précision : ${trimmedFreeText}`);
  }
  return lines.join("\n");
}
