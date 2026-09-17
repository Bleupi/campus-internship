export const ORGANISM_SEARCH_QUERY_KEY = (query: string) => ["organisms", "search", query] as const;
export const ORGANISM_DETAIL_QUERY_KEY = (id: string) => ["organisms", "detail", id] as const;
export const STRUCTURE_TYPES_QUERY_KEY = ["organisms", "structure-types"] as const;
