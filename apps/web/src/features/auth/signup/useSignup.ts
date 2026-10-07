import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signup } from "../api";
import { resetCacheForSessionStart } from "../session-cache";

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      resetCacheForSessionStart(queryClient, data);
    },
  });
}
