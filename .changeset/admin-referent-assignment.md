---
"api": minor
"web": minor
"shared": minor
---

Add referent listing and single assignment for "Demandes à traiter" (issue #148, part of #144). `GET /referents` returns every non-archived referent sorted by last name. `PATCH /referents/assignments` upserts on the `(studentId, schoolYear, semester, mandatory)` four-tuple as an in-place update — a reassignment never creates a duplicate row, never touches `Stage.version`, and can never reach an already `VALIDATED`/`REFUSED` stage's frozen snapshot (ADR-0014). Both routes are `ADMIN`-only via `RolesGuard`, and the referents domain now joins the conditionally-registered set alongside stages/organisms, so it is absent when `FEATURE_STAGE_MANAGEMENT` is off (ADR-0029) — it was previously registered unconditionally while empty.

- `packages/shared`: `assignReferentSchema`, `ReferentListItem`/`ReferentListResponse`/`AssignReferentRequest`/`AssignReferentResponse` in a new `referents.contract.ts`.
- `apps/api`: a `ReferentsController`/`ReferentsService` pair filling in the previously-empty `ReferentsModule`.
- `apps/web`: an inline `ReferentSelect` picker replaces the static referent text on each "Demandes à traiter" row; picking a referent assigns it and the row refreshes. No impact confirmation, bulk assignment, or "add a referent" escape hatch yet (later slices).
