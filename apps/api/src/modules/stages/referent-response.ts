import type { StageReferentResponse } from "shared";

// One place for how a live stage's derived referent (ADR-0003) is exposed, so
// the student detail and the admin list cannot drift apart.
export function toReferentResponse(referent: {
  id: string;
  user: { firstName: string; lastName: string };
}): StageReferentResponse {
  return { id: referent.id, firstName: referent.user.firstName, lastName: referent.user.lastName };
}
