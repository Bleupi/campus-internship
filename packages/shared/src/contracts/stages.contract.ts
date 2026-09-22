import type { z } from "zod";
import type { Promotion, Semester, StageStatus } from "../enums";
import type { createStageDraftSchema } from "../schemas/create-stage-draft.schema";
import type { updateStageDraftSchema } from "../schemas/update-stage-draft.schema";

export type CreateStageDraftRequest = z.infer<typeof createStageDraftSchema>;
export type UpdateStageDraftRequest = z.infer<typeof updateStageDraftSchema>;

// Issue #116. Both answer 409, so the body carries which one it is: a stale
// version asks the student to reload the draft (BR-09), a frozen row asks them
// to create a new organism/tutor instead of correcting the shared one.
export const STAGE_CONFLICT_CODES = {
  VERSION_CONFLICT: "STAGE_VERSION_CONFLICT",
  ROW_FROZEN: "STAGE_ROW_FROZEN",
  NOT_DRAFT: "STAGE_NOT_DRAFT",
} as const;
export type StageConflictCode = (typeof STAGE_CONFLICT_CODES)[keyof typeof STAGE_CONFLICT_CODES];

// `editable`: the row is still unfrozen for this student, so the wizard may
// offer to correct it in place rather than steer them to create a new one
// (issue #116). Computed on read, never stored.
export interface StageDraftOrganismResponse {
  id: string;
  name: string;
  structureType: string;
  city: string;
  postalCode: string;
  street: string;
  editable: boolean;
}

export interface StageDraftTutorResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string | null;
  acceptsPhoneContact: boolean;
  editable: boolean;
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
  // BR-09: echoed back by the client on PATCH.
  version: number;
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
export type UpdateStageDraftResponse = StageDetailResponse;

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

// Issue #146 (admin "Demandes à traiter"): one row per PENDING stage, oldest
// submission first. The referent is derived on the fly for the stage's exact
// (student, schoolYear, semester, mandatory) tuple (ADR-0003, ADR-0014, BR-03),
// null while none is assigned.
export interface AdminStageRequestListItem {
  id: string;
  version: number;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  service: string | null;
  submittedAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    promotion: Promotion | null;
  };
  organism: {
    name: string;
    structureType: string;
  };
  // Earliest period; the row shows it with the count of the others.
  firstPeriod: StageDraftPeriodResponse | null;
  periodCount: number;
  referent: StageReferentResponse | null;
}

export type AdminStageRequestListResponse = AdminStageRequestListItem[];

// Issue #147: everything the student provided for a single PENDING request,
// for the "Demandes à traiter" row-expand detail. No `editable` flags here
// (that concept is specific to the student's own DRAFT-correction flow) and
// no `id`s on organism/tutor: the admin only ever reads this, never edits it.
export interface AdminStageRequestOrganismDetail {
  name: string;
  structureType: string;
  street: string;
  postalCode: string;
  city: string;
}

export interface AdminStageRequestTutorDetail {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string | null;
  acceptsPhoneContact: boolean;
}

export interface AdminStageRequestDetailResponse {
  id: string;
  version: number;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  service: string | null;
  projectType: string | null;
  motivation: string | null;
  submittedAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    promotion: Promotion | null;
  };
  organism: AdminStageRequestOrganismDetail;
  tutor: AdminStageRequestTutorDetail;
  periods: StageDraftPeriodResponse[];
  referent: StageReferentResponse | null;
}
