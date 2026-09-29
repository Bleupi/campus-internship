import { hashKey, type QueryClient } from "@tanstack/react-query";
import type { MeResponse } from "shared";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

// Nothing fetched under one session may outlive it — not only another user's
// data, but also a query left errored when that session died with the tab
// open (a background refetch hitting an unrecoverable 401). useProfile's
// retryOnMount: false would replay such an error instead of refetching, so a
// student whose profile got validated meanwhile saw "Impossible de charger le
// profil" at their next login.

export function resetCacheForSessionStart(queryClient: QueryClient, currentUser: MeResponse) {
  queryClient.removeQueries();
  queryClient.setQueryData(CURRENT_USER_QUERY_KEY, currentUser);
}

// The current user is set to null rather than removed: the redirect to /login
// is a transition (React Router 7), so the protected tree renders once more,
// and a mounted useCurrentUser whose query was removed would refetch /auth/me
// for the dead session. null keeps the query and closes RequireAuth's gate.
// Being kept, it isn't cancelled by removeQueries like the others: an /auth/me
// still in flight would overwrite the null, so it is cancelled explicitly.
export async function resetCacheForSessionEnd(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: CURRENT_USER_QUERY_KEY, exact: true });
  queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryHash !== hashKey(CURRENT_USER_QUERY_KEY),
  });
}
