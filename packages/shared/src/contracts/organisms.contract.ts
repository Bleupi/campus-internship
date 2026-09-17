// Lightweight row for the search Autocomplete — no tutors (see
// OrganismDetailResponse for that), keeps the search endpoint cheap.
export interface OrganismSearchResultItem {
  id: string;
  name: string;
  structureType: string;
  city: string;
}

export interface OrganismTutorSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  phone: string | null;
  acceptsPhoneContact: boolean;
}

// Fetched once an organism is selected — prefills structureType/address
// read-only and scopes the tutor picker to this organism's own tutors.
export interface OrganismDetailResponse {
  id: string;
  name: string;
  structureType: string;
  city: string;
  postalCode: string;
  street: string;
  tutors: OrganismTutorSummary[];
}

export interface StructureTypeOption {
  id: string;
  label: string;
}

export type SearchOrganismsResponse = OrganismSearchResultItem[];
export type GetOrganismResponse = OrganismDetailResponse;
export type ListStructureTypesResponse = StructureTypeOption[];
