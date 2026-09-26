import type {
  CreateStageDraftRequest,
  CreateStageDraftResponse,
  DuplicateStageResponse,
  ListStagesQuery,
  StageDetailResponse,
  StageListItemResponse,
  UpdateStageDraftRequest,
  UpdateStageDraftResponse,
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

// Bodyless on the server (the stage id is the whole request); the empty object
// only satisfies apiClient.post's required body argument.
export function submitStage(id: string) {
  return apiClient.post<StageDetailResponse>(`/stages/${encodeURIComponent(id)}/submit`, {});
}

export function updateStageDraft(id: string, payload: UpdateStageDraftRequest) {
  return apiClient.patch<UpdateStageDraftResponse>(`/stages/${encodeURIComponent(id)}`, payload);
}

// Bodyless on the server, like submitStage.
export function duplicateStage(id: string) {
  return apiClient.post<DuplicateStageResponse>(`/stages/${encodeURIComponent(id)}/duplicate`, {});
}
