import { useQuery } from "@tanstack/react-query";
import { getReferentAssignments } from "../api";
import { REFERENT_ASSIGNMENTS_QUERY_KEY } from "../query-keys";

export function useReferentAssignments() {
  return useQuery({
    queryKey: REFERENT_ASSIGNMENTS_QUERY_KEY,
    queryFn: getReferentAssignments,
  });
}
