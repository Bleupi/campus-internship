import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "./api";
import { STUDENT_PROFILE_QUERY_KEY } from "./query-keys";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(STUDENT_PROFILE_QUERY_KEY, data);
    },
  });
}
