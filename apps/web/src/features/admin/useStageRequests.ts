import { useQuery } from "@tanstack/react-query";
import { getStageRequests } from "./api";
import { STAGE_REQUESTS_QUERY_KEY } from "./query-keys";

// BR-09: each row's `version` is what refuseStage() sends back to the API as
// the optimistic-lock check, and the referent picker reads the row's live
// state too. TanStack Query's defaults would silently refetch this list on
// window refocus/reconnect, pulling a newer version into the cache before
// the admin ever clicks — so a write that should conflict (something
// changed since they read it) would instead match, because the front had
// quietly moved on without the admin seeing anything change. The version an
// admin acts on must only change via an event they can see: the initial
// load, this page's own mutations invalidating the list, or an explicit
// reload (the existing 409 toast already tells them to do that).
export function useStageRequests() {
  return useQuery({
    queryKey: STAGE_REQUESTS_QUERY_KEY,
    queryFn: getStageRequests,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
