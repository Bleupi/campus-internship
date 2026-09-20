import type { ListStagesQuery } from "shared";

export const STAGES_LIST_QUERY_KEY = (query: ListStagesQuery) => ["stages", "list", query] as const;
export const STAGE_DETAIL_QUERY_KEY = (id: string) => ["stages", "detail", id] as const;
