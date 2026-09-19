import { useQuery } from "@tanstack/react-query";
import { getStage } from "./api";
import { STAGE_DETAIL_QUERY_KEY } from "./query-keys";

export function useStage(id: string) {
  return useQuery({
    queryKey: STAGE_DETAIL_QUERY_KEY(id),
    queryFn: () => getStage(id),
    // The dominant failure is a 404 (unknown or someone else's stage), which
    // retrying can't fix; show it immediately rather than after backoff.
    retry: false,
  });
}
