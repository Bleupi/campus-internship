import { useQuery } from "@tanstack/react-query";
import type { ListStagesQuery } from "shared";
import { listStages } from "./api";
import { STAGES_LIST_QUERY_KEY } from "./query-keys";

export function useStages(query: ListStagesQuery) {
  return useQuery({
    queryKey: STAGES_LIST_QUERY_KEY(query),
    queryFn: () => listStages(query),
  });
}
