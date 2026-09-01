import { useQuery } from "@tanstack/react-query";
import { getProfile } from "./api";
import { STUDENT_PROFILE_QUERY_KEY } from "./query-keys";

export function useProfile(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: STUDENT_PROFILE_QUERY_KEY,
    queryFn: getProfile,
    enabled: options.enabled ?? true,
    // BR-06's route guard (App.tsx) and ProfilePage both observe this query
    // at once while blocked. Without this, a second observer mounting onto
    // an already-errored query auto-retries (TanStack's retryOnMount
    // default), which briefly resets status to "pending" — hiding the
    // guard's <Outlet> (and unmounting ProfilePage), which remounts and
    // retries again: an infinite fetch loop for any student whose profile
    // fetch genuinely fails.
    retryOnMount: false,
  });
}
