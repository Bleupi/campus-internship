import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "./api";
import { resetCacheForSessionEnd } from "./session-cache";

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => resetCacheForSessionEnd(queryClient),
  });
}
