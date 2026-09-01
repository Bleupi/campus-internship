import type { CertificateQueueResponse } from "shared";
import { apiClient } from "../../lib/api-client";

export function getCertificateQueue() {
  return apiClient.get<CertificateQueueResponse>("/admin/students/certificate-queue");
}
