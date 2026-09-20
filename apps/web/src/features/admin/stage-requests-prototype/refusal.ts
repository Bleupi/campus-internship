// PROTOTYPE — recurring refusal reasons supplied by the admin.
export const REFUSAL_REASONS = [
  { id: "address", label: "L'adresse de l'organisme est incomplète." },
  { id: "tutor", label: "Le tuteur n'est pas enseignant en APA." },
  { id: "missing", label: "Il manque les informations suivantes :", needsDetail: true },
  { id: "duplicate", label: "Il y a deux projets de stage pour le même stage." },
] as const;

export interface RefusalDraft {
  checked: string[];
  missingDetail: string;
  freeText: string;
}

export const emptyRefusal = (): RefusalDraft => ({ checked: [], missingDetail: "", freeText: "" });

// "Il manque les informations suivantes :" is meaningless without the list.
export function isRefusalValid(d: RefusalDraft) {
  if (d.checked.includes("missing") && !d.missingDetail.trim()) return false;
  return d.checked.length > 0 || d.freeText.trim().length > 0;
}

export function buildRefusalReason(d: RefusalDraft): string {
  const lines = REFUSAL_REASONS.filter((r) => d.checked.includes(r.id)).map((r) =>
    "needsDetail" in r ? `- ${r.label} ${d.missingDetail.trim()}` : `- ${r.label}`,
  );
  if (d.freeText.trim()) lines.push(`Autre précision : ${d.freeText.trim()}`);
  return lines.join("\n");
}
