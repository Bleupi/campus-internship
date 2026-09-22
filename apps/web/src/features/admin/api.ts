import type {
  AdminProfileTransitionResponse,
  AdminStageRequestDetailResponse,
  AdminStageRequestListResponse,
  AssignReferentRequest,
  AssignReferentResponse,
  CertificateQueueResponse,
  CreateReferentRequest,
  CreateReferentResponse,
  ReferentListResponse,
} from "shared";
import { apiClient } from "../../lib/api-client";

export function getCertificateQueue() {
  return apiClient.get<CertificateQueueResponse>("/admin/students/certificate-queue");
}

// Issue #43 (ADR-0024): proxied stream — the browser never sees a bucket
// URL, only this Blob fetched through the authenticated api-client.
export function getCertificate(studentId: string) {
  return apiClient.getBlob(`/admin/students/${studentId}/profile/certificate`);
}

export function validateProfile(studentId: string) {
  return apiClient.patch<AdminProfileTransitionResponse>(
    `/admin/students/${studentId}/profile/validate`,
    {},
  );
}

export function rejectProfile(studentId: string, reason: string) {
  return apiClient.patch<AdminProfileTransitionResponse>(
    `/admin/students/${studentId}/profile/reject`,
    { reason },
  );
}

// Issue #146: every PENDING stage request, oldest submission first.
export function getStageRequests() {
  return apiClient.get<AdminStageRequestListResponse>("/admin/stage-requests");
}

// Issue #147: everything the student provided for one PENDING request, for
// the row-expand detail.
export function getStageRequestDetail(id: string) {
  return apiClient.get<AdminStageRequestDetailResponse>(`/admin/stage-requests/${id}`);
}

// Issue #148: all non-archived referents, sorted by last name — the inline
// picker's option list.
export function getReferents() {
  return apiClient.get<ReferentListResponse>("/referents");
}

// Issue #148: upserts on the (studentId, schoolYear, semester, mandatory)
// four-tuple as an in-place update (ADR-0014).
export function assignReferent(payload: AssignReferentRequest) {
  return apiClient.patch<AssignReferentResponse>("/referents/assignments", payload);
}

// Issue #150 (ADR-0031): creates the referent, or adds the role and profile to
// the user already holding that email.
export function createReferent(payload: CreateReferentRequest) {
  return apiClient.post<CreateReferentResponse>("/admin/referents", payload);
}
