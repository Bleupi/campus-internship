import type { QueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

// A new session must not inherit the previous one's cache — not only another
// user's data, but also a query left errored when that session died with the
// tab open (a background refetch hitting an unrecoverable 401). useProfile's
// retryOnMount: false would replay such an error instead of refetching, so
// a student whose profile got validated meanwhile saw "Impossible de charger
// le profil" at their next login. Dropping everything makes every query
// fetch afresh under the new session's cookies.
export function startSession(queryClient: QueryClient, currentUser: unknown) {
  queryClient.removeQueries();
  queryClient.setQueryData(CURRENT_USER_QUERY_KEY, currentUser);
}
