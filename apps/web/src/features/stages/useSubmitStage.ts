import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitStage } from "./api";
import { STAGES_QUERY_KEY } from "./query-keys";

// Takes the stage id when mutating, not when the hook is created: the wizard
// only learns the id once the draft it is about to submit has been saved.
export function useSubmitStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stageId: string) => submitStage(stageId),
    // On success the stage changed status and gained a submission date; on a
    // 400/409 what the page showed (profile status, stage status) was stale.
    // Either way both the detail page and the "Mes demandes" list must refetch.
    onSettled: () => queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY }),
  });
}
