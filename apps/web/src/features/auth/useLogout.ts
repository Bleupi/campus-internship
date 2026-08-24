import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "./api";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, undefined);
    },
  });
}
