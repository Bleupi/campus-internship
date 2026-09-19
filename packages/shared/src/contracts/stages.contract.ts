import type { z } from "zod";
import type { Semester, StageStatus } from "../enums";
import type { createStageDraftSchema } from "../schemas/create-stage-draft.schema";

export type CreateStageDraftRequest = z.infer<typeof createStageDraftSchema>;

export interface StageDraftOrganismResponse {
  id: string;
  name: string;
  structureType: string;
  city: string;
  postalCode: string;
  street: string;
}

export interface StageDraftTutorResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string | null;
  acceptsPhoneContact: boolean;
}

export interface StageDraftPeriodResponse {
  id: string;
  startDate: string;
  endDate: string;
}

// Deliberately not the full future stage-detail shape (list/detail is
// issue #114) — just enough for this wizard's own recap step and the
// redirect after saving.
export interface StageDraftResponse {
  id: string;
  status: StageStatus;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  service: string | null;
  projectType: string | null;
  motivation: string | null;
  organism: StageDraftOrganismResponse;
  tutor: StageDraftTutorResponse;
  periods: StageDraftPeriodResponse[];
}

export type CreateStageDraftResponse = StageDraftResponse;
