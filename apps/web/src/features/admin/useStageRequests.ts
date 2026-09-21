import { useQuery } from "@tanstack/react-query";
import { getStageRequests } from "./api";
import { STAGE_REQUESTS_QUERY_KEY } from "./query-keys";

export function useStageRequests() {
  return useQuery({
    queryKey: STAGE_REQUESTS_QUERY_KEY,
    queryFn: getStageRequests,
  });
}
