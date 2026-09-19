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

// Just enough for the wizard's own recap step and the redirect after saving;
// the full read shape (referent, refusal reason, submission date) is
// StageDetailResponse below.
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

export interface StageReferentResponse {
  id: string;
  firstName: string;
  lastName: string;
}

// Issue #114. Same shape whatever the status (ADR-0003's single read path):
// for DRAFT/PENDING the referent is derived on the fly from ReferentAssignment
// (null when none exists yet), for VALIDATED/REFUSED it comes from the snapshot.
export interface StageDetailResponse extends StageDraftResponse {
  submittedAt: string | null;
  refusalReason: string | null;
  referent: StageReferentResponse | null;
}

export interface StageListItemResponse {
  id: string;
  status: StageStatus;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  // Read from the live organism, so only present while DRAFT/PENDING — a
  // frozen stage's display source is its snapshot (ADR-0003, BR-08).
  organismName: string | null;
  submittedAt: string | null;
  periods: StageDraftPeriodResponse[];
}
