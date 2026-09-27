import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signup } from "../api";
import { startSession } from "../start-session";

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      startSession(queryClient, data);
    },
  });
}
