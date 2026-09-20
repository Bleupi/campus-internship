import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateStageDraftRequest } from "shared";
import { updateStageDraft } from "./api";
import { STAGES_QUERY_KEY } from "./query-keys";

export function useUpdateStageDraft(stageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateStageDraftRequest) => updateStageDraft(stageId, payload),
    // Even a rejected write means what the page showed is stale (a stale
    // version, a row frozen since): refetch the list and the detail either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY }),
  });
}
