import type { AdminProfileTransitionResponse, CertificateQueueResponse } from "shared";
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
