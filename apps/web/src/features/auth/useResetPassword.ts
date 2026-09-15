import { useMutation } from "@tanstack/react-query";
import { resetPassword } from "./api";

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}
