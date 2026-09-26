import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignReferentRequest } from "shared";
import { assignReferent } from "../../api";
import { STAGE_REQUESTS_QUERY_KEY } from "../../query-keys";

// Issue #148: single assignment only — no bulk form. The impact confirmation
// (#149) is the page's job, before this is called. A clean success refetches
// the list so the row(s) sharing the tuple pick up the new referent (ADR-0014).
export function useAssignReferent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignReferentRequest) => assignReferent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAGE_REQUESTS_QUERY_KEY });
    },
  });
}
