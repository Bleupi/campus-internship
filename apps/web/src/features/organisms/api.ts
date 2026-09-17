import type {
  GetOrganismResponse,
  ListStructureTypesResponse,
  SearchOrganismsResponse,
} from "shared";
import { apiClient } from "../../lib/api-client";

export function searchOrganisms(query: string) {
  return apiClient.get<SearchOrganismsResponse>(`/organisms/search?q=${encodeURIComponent(query)}`);
}

export function getOrganism(id: string) {
  return apiClient.get<GetOrganismResponse>(`/organisms/${id}`);
}

export function getStructureTypes() {
  return apiClient.get<ListStructureTypesResponse>("/organisms/structure-types");
}
