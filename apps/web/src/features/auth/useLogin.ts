import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login } from "./api";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, data);
    },
  });
}
