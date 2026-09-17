import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { searchOrganisms } from "./api";
import { ORGANISM_SEARCH_QUERY_KEY } from "./query-keys";

const DEBOUNCE_MS = 300;

export function useOrganismSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  return useQuery({
    queryKey: ORGANISM_SEARCH_QUERY_KEY(debouncedQuery),
    queryFn: () => searchOrganisms(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });
}
