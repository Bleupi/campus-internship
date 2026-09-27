import { hashKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "./api";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    // Nothing fetched under the ended session may outlive it (see
    // start-session.ts), but the current user is set to null rather than
    // removed. The redirect to /login is a transition (React Router 7), so the
    // protected tree still renders once after this; a mounted useCurrentUser
    // whose query was removed would rebuild it and refetch /auth/me for the
    // dead session. Setting null keeps the same query (no refetch) and closes
    // RequireAuth's gate. (setQueryData(key, undefined) is a no-op in v5.)
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryHash !== hashKey(CURRENT_USER_QUERY_KEY),
      });
    },
  });
}
