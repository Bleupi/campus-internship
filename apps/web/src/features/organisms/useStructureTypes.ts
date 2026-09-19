import { useQuery } from "@tanstack/react-query";
import { getStructureTypes } from "./api";
import { STRUCTURE_TYPES_QUERY_KEY } from "./query-keys";

export function useStructureTypes() {
  return useQuery({
    queryKey: STRUCTURE_TYPES_QUERY_KEY,
    queryFn: getStructureTypes,
  });
}
