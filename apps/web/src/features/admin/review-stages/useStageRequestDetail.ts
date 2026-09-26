import { useQuery } from "@tanstack/react-query";
import { getStageRequestDetail } from "../api";
import { stageRequestDetailQueryKey } from "../query-keys";

// Issue #147: fetched only once a row is expanded (`enabled`), so collapsed
// rows never cost a request.
export function useStageRequestDetail(id: string, enabled: boolean) {
  return useQuery({
    queryKey: stageRequestDetailQueryKey(id),
    queryFn: () => getStageRequestDetail(id),
    enabled,
  });
}
