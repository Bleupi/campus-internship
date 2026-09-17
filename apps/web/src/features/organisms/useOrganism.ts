import { useQuery } from "@tanstack/react-query";
import { getOrganism } from "./api";
import { ORGANISM_DETAIL_QUERY_KEY } from "./query-keys";

export function useOrganism(id: string | null) {
  return useQuery({
    queryKey: ORGANISM_DETAIL_QUERY_KEY(id ?? ""),
    queryFn: () => getOrganism(id!),
    enabled: id !== null,
  });
}
