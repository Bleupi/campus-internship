import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signup } from "./api";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, data);
    },
  });
}
