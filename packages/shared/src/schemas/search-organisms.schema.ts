import { z } from "zod";

// Query-string validation for GET /organisms/search — `q` is optional
// (an empty/missing query just yields no results, see OrganismsService).
export const searchOrganismsQuerySchema = z.object({
  q: z.string().trim().default(""),
});

export type SearchOrganismsQuery = z.infer<typeof searchOrganismsQuerySchema>;
