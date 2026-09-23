// Issue #151: the four recurring stage-refusal reasons, hard-coded here like
// reject-reason.ts's certificate ones — the API only ever sees the final
// built string (refuseStageSchema, packages/shared).
export const REFUSAL_REASONS = [
  "L'adresse de l'organisme est incomplète.",
  "Le tuteur n'est pas enseignant en APA.",
  "Il manque les informations suivantes :",
  "Il y a deux projets de stage pour le même stage.",
] as const;

// The one reason whose own free-text detail is required when ticked, and
// rendered on the same bullet line rather than as a separate paragraph.
export const MISSING_INFO_REASON: (typeof REFUSAL_REASONS)[number] =
  "Il manque les informations suivantes :";

// Builds refuseStageSchema's single `reason` string: each ticked reason as a
// "- <reason>" bullet, MISSING_INFO_REASON's bullet followed by its own
// detail on the same line, then an optional trailing unbulleted
// "Autre précision : …" line.
export function buildRefusalReason(
  checkedReasons: readonly string[],
  missingInfoDetail: string,
  freeText: string,
): string {
  const lines = checkedReasons.map((reason) =>
    reason === MISSING_INFO_REASON ? `- ${reason} ${missingInfoDetail.trim()}` : `- ${reason}`,
  );
  const trimmedFreeText = freeText.trim();
  if (trimmedFreeText.length > 0) {
    lines.push(`Autre précision : ${trimmedFreeText}`);
  }
  return lines.join("\n");
}

// The Refuse button's disabled rule: at least one reason must be given
// (a checked box, or free text alone), and when MISSING_INFO_REASON is
// ticked its own detail must be filled too — otherwise a bullet like
// "- Il manque les informations suivantes : " would refuse without saying
// what is actually missing.
export function isRefusalReasonComplete(
  checkedReasons: readonly string[],
  missingInfoDetail: string,
  freeText: string,
): boolean {
  if (checkedReasons.length === 0 && freeText.trim().length === 0) {
    return false;
  }
  if (checkedReasons.includes(MISSING_INFO_REASON) && missingInfoDetail.trim().length === 0) {
    return false;
  }
  return true;
}
