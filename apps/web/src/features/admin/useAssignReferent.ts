import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignReferentRequest } from "shared";
import { assignReferent } from "./api";
import { STAGE_REQUESTS_QUERY_KEY } from "./query-keys";

// Issue #148: single assignment only — no impact confirmation yet (a later
// ticket) and no bulk form. A clean success refetches the list so the row(s)
// sharing the tuple pick up the new referent (ADR-0014).
export function useAssignReferent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignReferentRequest) => assignReferent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAGE_REQUESTS_QUERY_KEY });
    },
  });
}
