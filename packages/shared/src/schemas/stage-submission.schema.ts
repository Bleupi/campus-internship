import type { ProfileStatus } from "../enums";
import { stagePeriodsSchema } from "./stage-period.schema";

// What the submission gate needs to know about a draft. Deliberately flat and
// primitive so the API (Prisma rows) and the web (StageDetailResponse) can
// both build it without either side's types leaking in here. `mandatory` is
// absent on purpose: createStageDraftSchema already requires an explicit
// boolean, so a saved draft can never lack that choice.
export interface SubmissionCandidate {
  profileStatus: ProfileStatus;
  hasOrganism: boolean;
  hasTutor: boolean;
  service: string | null;
  projectType: string | null;
  motivation: string | null;
  periods: { startDate: Date | string; endDate: Date | string }[];
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

// BR-02 + the submission-completeness rule (issue #115): the one place that
// decides whether a DRAFT may become PENDING. It returns human-readable French
// reasons rather than codes because both consumers show them as is: the API
// puts them in its 400 body, and the web prints them next to the disabled
// "Soumettre" button. An empty array means the draft can be submitted.
export function getSubmissionBlockers(candidate: SubmissionCandidate): string[] {
  const blockers: string[] = [];

  if (candidate.profileStatus !== "VALID") {
    blockers.push(
      "Votre profil de stage doit d'abord être validé par l'administration pour soumettre une demande.",
    );
  }
  if (!candidate.hasOrganism) blockers.push("Choisissez un organisme d'accueil.");
  if (!candidate.hasTutor) blockers.push("Choisissez un tuteur.");
  if (isBlank(candidate.service)) blockers.push("Renseignez le service.");
  if (isBlank(candidate.projectType)) blockers.push("Renseignez le type de handicap concerné.");
  if (isBlank(candidate.motivation)) blockers.push("Renseignez votre motivation.");
  if (!stagePeriodsSchema.safeParse(candidate.periods).success) {
    blockers.push("Ajoutez au moins une période valide.");
  }

  return blockers;
}
