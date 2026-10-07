import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login } from "../api";
import { resetCacheForSessionStart } from "../session-cache";

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      resetCacheForSessionStart(queryClient, data);
    },
  });
}
