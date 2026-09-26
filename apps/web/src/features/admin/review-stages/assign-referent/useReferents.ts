import { useQuery } from "@tanstack/react-query";
import { getReferents } from "../../api";
import { REFERENTS_QUERY_KEY } from "../../query-keys";

export function useReferents() {
  return useQuery({
    queryKey: REFERENTS_QUERY_KEY,
    queryFn: getReferents,
  });
}
