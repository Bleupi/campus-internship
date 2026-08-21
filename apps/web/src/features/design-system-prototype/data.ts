// PROTOTYPE — throwaway stub data shared by both design-system variants.
// Not the real domain layer: hand-shaped to look like Stage/HostOrganism/Tutor
// (see docs/dataModel.md) without hitting the API.

export const structureTypes = [
  "Entreprise",
  "Association",
  "Collectivité territoriale",
  "Établissement scolaire",
  "Autre",
] as const;

export const projectTypes = [
  "Déficience visuelle",
  "Déficience auditive",
  "Trouble moteur",
  "Trouble cognitif",
  "Autre",
] as const;

export type StageStatus = "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";

export const statusLabels: Record<StageStatus, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente",
  VALIDATED: "Validé",
  REFUSED: "Refusé",
};

export interface StageRow {
  id: string;
  schoolYear: string;
  semester: "S1" | "S2";
  organismName: string;
  city: string;
  mandatory: boolean;
  status: StageStatus;
  periodLabel: string;
}

export const stageRows: StageRow[] = [
  {
    id: "1",
    schoolYear: "2025-2026",
    semester: "S1",
    organismName: "Institut des Jeunes Sourds",
    city: "Lyon",
    mandatory: true,
    status: "VALIDATED",
    periodLabel: "02 sept. 2025 – 20 déc. 2025",
  },
  {
    id: "2",
    schoolYear: "2025-2026",
    semester: "S2",
    organismName: "APF France Handicap",
    city: "Villeurbanne",
    mandatory: false,
    status: "PENDING",
    periodLabel: "12 jan. 2026 – 27 mars 2026",
  },
  {
    id: "3",
    schoolYear: "2024-2025",
    semester: "S2",
    organismName: "Centre de Rééducation Fonctionnelle",
    city: "Vénissieux",
    mandatory: true,
    status: "REFUSED",
    periodLabel: "03 fév. 2025 – 11 avr. 2025",
  },
  {
    id: "4",
    schoolYear: "2025-2026",
    semester: "S1",
    organismName: "ESAT Les Ateliers du Rhône",
    city: "Bron",
    mandatory: false,
    status: "DRAFT",
    periodLabel: "—",
  },
];
