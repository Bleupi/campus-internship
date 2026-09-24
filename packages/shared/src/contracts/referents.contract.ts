import type { z } from "zod";
import type { assignReferentSchema } from "../schemas/assign-referent.schema";
import type { createReferentSchema } from "../schemas/create-referent.schema";

export type AssignReferentRequest = z.infer<typeof assignReferentSchema>;

// Issue #148: all non-archived referents, sorted by last name — the inline
// picker's full option list (ADR-0014/#144: no workload hint, rejected).
export interface ReferentListItem {
  id: string;
  firstName: string;
  lastName: string;
}

export type ReferentListResponse = ReferentListItem[];

// The referent now assigned to the tuple, so the caller can update the row
// it acted on without a full refetch of the list it came from.
export type AssignReferentResponse = ReferentListItem;

// Issue #150 (ADR-0031): creates the referent — or adds the REFERENT role and
// profile to the user already holding that email — and returns it in the
// picker's own shape, so it can be assigned straight away.
export type CreateReferentRequest = z.infer<typeof createReferentSchema>;

export type CreateReferentResponse = ReferentListItem;
