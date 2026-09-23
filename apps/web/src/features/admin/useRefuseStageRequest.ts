import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefuseStageRequest } from "shared";
import { ApiError } from "../../lib/api-client";
import { refuseStageRequest } from "./api";
import { STAGE_REQUESTS_QUERY_KEY } from "./query-keys";

// Same split as useProfileActions.ts: a clean success refetches the list so
// the refused request leaves "Demandes à traiter" immediately, and a 409
// (stale version, or the request left PENDING in the meantime) means the row
// is stale either way — refetch drops or corrects it. Any other error leaves
// the list untouched. The "cette demande a été modifiée" toast itself is the
// caller's concern (StageRequestsPage), not this hook's.
function shouldRefetchList(error: unknown): boolean {
  return !error || (error instanceof ApiError && error.status === 409);
}

export function useRefuseStageRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & RefuseStageRequest) =>
      refuseStageRequest(id, payload),
    onSettled: (_data, error) => {
      if (shouldRefetchList(error)) {
        queryClient.invalidateQueries({ queryKey: STAGE_REQUESTS_QUERY_KEY });
      }
    },
  });
}
