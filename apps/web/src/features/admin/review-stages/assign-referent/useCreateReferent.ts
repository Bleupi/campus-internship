import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateReferentRequest } from "shared";
import { createReferent } from "../../api";
import { REFERENTS_QUERY_KEY } from "../../query-keys";

// Issue #150: the new referent joins every row's picker options.
export function useCreateReferent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateReferentRequest) => createReferent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REFERENTS_QUERY_KEY });
    },
  });
}
