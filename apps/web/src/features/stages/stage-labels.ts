import type { Semester, StageListItemResponse, StageStatus } from "shared";

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  VALIDATED: "Validée",
  REFUSED: "Refusée",
};

export const SEMESTER_LABELS: Record<Semester, string> = {
  S1: "Semestre 1",
  S2: "Semestre 2",
};

export function formatStageKind(mandatory: boolean) {
  return mandatory ? "Stage obligatoire" : "Stage facultatif";
}

// A frozen stage carries no organism name until it is read from its snapshot.
export function organismLabel(stage: StageListItemResponse) {
  return stage.organismName ?? "Organisme indisponible";
}
