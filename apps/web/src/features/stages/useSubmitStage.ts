import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitStage } from "./api";
import { STAGES_QUERY_KEY } from "./query-keys";

export function useSubmitStage(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => submitStage(id),
    // On success the stage changed status and gained a submission date; on a
    // 400/409 what the page showed (profile status, stage status) was stale.
    // Either way both the detail page and the "Mes demandes" list must refetch.
    onSettled: () => queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY }),
  });
}
