import type {
  CreateStageDraftRequest,
  CreateStageDraftResponse,
  ListStagesQuery,
  StageDetailResponse,
  StageListItemResponse,
} from "shared";
import { apiClient } from "../../lib/api-client";

export function createStageDraft(payload: CreateStageDraftRequest) {
  return apiClient.post<CreateStageDraftResponse>("/stages", payload);
}

export function listStages(query: ListStagesQuery) {
  const params = new URLSearchParams({ sort: query.sort });
  if (query.status) params.set("status", query.status);
  if (query.semester) params.set("semester", query.semester);
  return apiClient.get<StageListItemResponse[]>(`/stages?${params}`);
}

export function getStage(id: string) {
  return apiClient.get<StageDetailResponse>(`/stages/${encodeURIComponent(id)}`);
}
