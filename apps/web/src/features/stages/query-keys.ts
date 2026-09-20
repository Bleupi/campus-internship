import type { ListStagesQuery } from "shared";

// Prefix of every stages query, for invalidating list and detail together.
export const STAGES_QUERY_KEY = ["stages"] as const;
export const STAGES_LIST_QUERY_KEY = (query: ListStagesQuery) => ["stages", "list", query] as const;
export const STAGE_DETAIL_QUERY_KEY = (id: string) => ["stages", "detail", id] as const;
