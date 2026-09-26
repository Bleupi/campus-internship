import { useMutation } from "@tanstack/react-query";
import { createStageDraft } from "../../api";

export function useCreateStageDraft() {
  return useMutation({ mutationFn: createStageDraft });
}
