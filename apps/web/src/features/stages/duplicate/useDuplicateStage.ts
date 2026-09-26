import { useMutation, useQueryClient } from "@tanstack/react-query";
import { duplicateStage } from "../api";
import { STAGES_QUERY_KEY } from "../query-keys";

// Takes the source id when mutating, not when the hook is created: the list
// shares one hook across all its rows.
export function useDuplicateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stageId: string) => duplicateStage(stageId),
    // Returned, so the mutation stays pending until the list has refetched and
    // the new draft is there: the button can't be clicked twice in between.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY }),
  });
}
