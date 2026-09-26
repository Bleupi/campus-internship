import type { z } from "zod";
import type { Promotion, Semester, StageStatus } from "../enums";
import type { createStageDraftSchema } from "../schemas/create-stage-draft.schema";
import type { refuseStageSchema } from "../schemas/refuse-stage.schema";
import type { updateStageDraftSchema } from "../schemas/update-stage-draft.schema";
import type { validateStageSchema } from "../schemas/validate-stage.schema";

export type CreateStageDraftRequest = z.infer<typeof createStageDraftSchema>;
export type UpdateStageDraftRequest = z.infer<typeof updateStageDraftSchema>;

// Issue #116/#151. All answer 409, so the body carries which one it is: a
// stale version asks the caller to reload (BR-09), a frozen row asks the
// student to create a new organism/tutor instead of correcting the shared
// one, NOT_DRAFT/NOT_PENDING guard the student- and admin-side status
// preconditions, and NO_REFERENT is BR-03 (validate/refuse without an
// assigned referent).
export const STAGE_CONFLICT_CODES = {
  VERSION_CONFLICT: "STAGE_VERSION_CONFLICT",
  ROW_FROZEN: "STAGE_ROW_FROZEN",
  NOT_DRAFT: "STAGE_NOT_DRAFT",
  NOT_PENDING: "STAGE_NOT_PENDING",
  NO_REFERENT: "STAGE_NO_REFERENT",
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
export type DuplicateStageResponse = StageDraftResponse;

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
  // When the admin validated or refused it (ADR-0033), null while live.
  decidedAt: string | null;
  refusalReason: string | null;
  referent: StageReferentResponse | null;
}

export interface StageListItemResponse {
  id: string;
  status: StageStatus;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  // From the live organism while DRAFT/PENDING, from the snapshot once
  // decided (ADR-0003, BR-08). Null only when a decided stage's snapshot is
  // unreadable: the live organism is never a fallback.
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
  // Never null here: BR-02 requires service to be non-blank to submit. Not
  // StageDraftResponse's `service` (nullable there — a DRAFT can be partial).
  service: string;
  submittedAt: string;
  // Never null here: BR-02 requires a VALID profile to submit, and a profile
  // can only reach VALID once promotion is set (students.service.ts) — it is
  // never cleared afterward. Not the general StudentProfile shape (which
  // stays `Promotion | null` pre-completion).
  student: {
    id: string;
    firstName: string;
    lastName: string;
    promotion: Promotion;
  };
  organism: {
    name: string;
    structureType: string;
  };
  // Earliest period; the row shows it with the count of the others.
  firstPeriod: StageDraftPeriodResponse | null;
  periodCount: number;
  referent: StageReferentResponse | null;
  // Issue #149: how many *other* live (DRAFT/PENDING) stages of the same
  // student share this request's referent tuple — i.e. what else a referent
  // change on this request would also reassign (ADR-0014). Never counts
  // decided stages nor the request itself; drives the impact confirmation
  // without an extra call.
  otherLiveStageCount: number;
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

// Issue #154: one of the student's own previously VALIDATED **mandatory**
// stages, read from its frozen snapshot (ADR-0033, BR-08) — so a later edit
// to the live organism or the student's promotion never changes what is
// shown here. `promotion` is the student's promotion at decision time, not
// their current one.
export interface AdminPreviousMandatoryStage {
  schoolYear: string;
  semester: Semester;
  promotion: Promotion;
  organism: {
    name: string;
    structureType: string;
  };
  service: string;
}

export interface AdminStageRequestDetailResponse {
  id: string;
  version: number;
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  // Never null: BR-02 requires all three to be non-blank to submit. Not
  // StageDraftResponse's fields of the same name (nullable there — a DRAFT
  // can be partial).
  service: string;
  projectType: string;
  motivation: string;
  submittedAt: string;
  // Never null here — same BR-02 invariant as AdminStageRequestListItem above.
  // `email` is the login (university) address, not the mutable personalEmail.
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    promotion: Promotion;
  };
  organism: AdminStageRequestOrganismDetail;
  tutor: AdminStageRequestTutorDetail;
  periods: StageDraftPeriodResponse[];
  referent: StageReferentResponse | null;
  // Issue #154: most recent decision first; empty when the student has none.
  previousMandatoryStages: AdminPreviousMandatoryStage[];
}

// Issue #151 (BR-08, ADR-0003, ADR-0033): the wire request/response for
// refusing a stage. The frozen snapshot's own shape is `StageSnapshot`
// (apps/api/src/modules/stages/stage-snapshot.schema.ts) — ADR-0033 keeps it
// out of `packages/shared` since only the API writes and reads it.
export type RefuseStageRequest = z.infer<typeof refuseStageSchema>;

// Confirms the transition; the web drops the row from "Demandes à traiter"
// via a refetch rather than needing the full snapshot back.
export interface RefuseStageResponse {
  id: string;
  status: "REFUSED";
  decidedAt: string;
}

// Issue #152 (BR-08, BR-09): the wire request/response for validating a
// stage. Same frozen-snapshot shape as refusal (ADR-0033), but no `reason`.
export type ValidateStageRequest = z.infer<typeof validateStageSchema>;

export interface ValidateStageResponse {
  id: string;
  status: "VALIDATED";
  decidedAt: string;
}
