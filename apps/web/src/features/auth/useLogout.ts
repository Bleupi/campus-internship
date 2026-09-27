import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "./api";

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    // Drop the whole cache, not just the current user: nothing fetched under
    // the ended session may outlive it (see start-session.ts). Removing is
    // required — setQueryData(key, undefined) is a no-op in TanStack Query v5.
    onSuccess: () => {
      queryClient.removeQueries();
    },
  });
}
