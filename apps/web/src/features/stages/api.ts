import type { CreateStageDraftRequest, CreateStageDraftResponse } from "shared";
import { apiClient } from "../../lib/api-client";

export function createStageDraft(payload: CreateStageDraftRequest) {
  return apiClient.post<CreateStageDraftResponse>("/stages", payload);
}
