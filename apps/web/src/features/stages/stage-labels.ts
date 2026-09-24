import type { Semester, StageListItemResponse, StageStatus } from "shared";
import { formatPeriodRange } from "./format-summary";

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  VALIDATED: "Validé",
  REFUSED: "Refusé",
};

export const SEMESTER_LABELS: Record<Semester, string> = {
  S1: "Semestre 1",
  S2: "Semestre 2",
};

export function formatStageKind(mandatory: boolean) {
  return mandatory ? "Stage obligatoire" : "Stage facultatif";
}

// The API reads the name from the live organism or the snapshot, by status
// (BR-08). It is null only when a decided stage's snapshot was unreadable.
export function organismLabel(stage: StageListItemResponse) {
  return stage.organismName ?? "Organisme indisponible";
}

// The dense row shows the first period only (as the chosen prototype does);
// the others are one tap away in the expanded row / detail page.
export function formatFirstPeriod(stage: StageListItemResponse) {
  const [first, ...others] = stage.periods;
  if (!first) return "Aucune période";
  return others.length > 0
    ? `${formatPeriodRange(first)} (+${others.length})`
    : formatPeriodRange(first);
}
