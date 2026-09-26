import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../../lib/api-client";
import { validateStageRequest } from "../../api";
import { STAGE_REQUESTS_QUERY_KEY } from "../../query-keys";

// Same split as useRefuseStageRequest.ts: a clean success refetches the list
// so the validated request leaves "Demandes à traiter" immediately, and a 409
// (stale version, or the request left PENDING in the meantime) means the row
// is stale either way — refetch drops or corrects it. Any other error leaves
// the list untouched.
function shouldRefetchList(error: unknown): boolean {
  return !error || (error instanceof ApiError && error.status === 409);
}

export function useValidateStageRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      validateStageRequest(id, { version }),
    onSettled: (_data, error) => {
      if (shouldRefetchList(error)) {
        queryClient.invalidateQueries({ queryKey: STAGE_REQUESTS_QUERY_KEY });
      }
    },
  });
}
