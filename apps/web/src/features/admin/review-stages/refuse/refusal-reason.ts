// Issue #151: the three recurring stage-refusal reasons, hard-coded here
// like reject-reason.ts's certificate ones — the API only ever sees the
// final built string (refuseStageSchema, packages/shared).
export const REFUSAL_REASONS = [
  "L'adresse de l'organisme est incomplète.",
  "Le tuteur n'est pas enseignant en APA.",
  "Il y a deux projets de stage pour le même stage.",
] as const;

// A static label shown directly above the free-text "Précision" field — not
// a selectable reason and not its own input (QA feedback on #151, which
// removed it from REFUSAL_REASONS). Matches buildRefusalReason()'s own
// "Autre précision : …" line below, since that's exactly what this field
// becomes once appended.
export const PRECISION_HINT = "Autre précision :";

// Builds refuseStageSchema's single `reason` string: each ticked reason as a
// "- <reason>" bullet, then an optional trailing unbulleted
// "Autre précision : …" line.
export function buildRefusalReason(checkedReasons: readonly string[], freeText: string): string {
  const lines = checkedReasons.map((reason) => `- ${reason}`);
  const trimmedFreeText = freeText.trim();
  if (trimmedFreeText.length > 0) {
    lines.push(`Autre précision : ${trimmedFreeText}`);
  }
  return lines.join("\n");
}

// The Refuse button's disabled rule: at least one reason must be given —
// a checked box, or free text alone.
export function isRefusalReasonComplete(
  checkedReasons: readonly string[],
  freeText: string,
): boolean {
  return checkedReasons.length > 0 || freeText.trim().length > 0;
}
