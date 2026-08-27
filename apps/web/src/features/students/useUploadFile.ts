import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UploadFileResponse } from "shared";
import { STUDENT_PROFILE_QUERY_KEY } from "./query-keys";

export function useUploadFile(mutationFn: (file: File) => Promise<UploadFileResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(STUDENT_PROFILE_QUERY_KEY, data);
    },
  });
}
