---
"api": minor
"web": minor
"shared": minor
---

Add the admin "Demandes à traiter" list (issue #146, first slice of #144). `GET /admin/stage-requests` returns every `PENDING` stage, oldest submission first (drafts, validated and refused stages never appear), with the student, organism and structure type, service, first period and period count, semester, kind and school year. The referent is derived per row for the exact `(student, schoolYear, semester, mandatory)` tuple, so a referent assigned for the other `mandatory` value is never shown (BR-03, ADR-0014); it is read-only here. `ADMIN`-only via `RolesGuard`, and registered with `StagesModule`, so the route is absent when `FEATURE_STAGE_MANAGEMENT` is off (ADR-0029). No pagination in V1.

- `packages/shared`: `AdminStageRequestListItem`/`AdminStageRequestListResponse` in `stages.contract.ts`.
- `apps/api`: an `AdminStageRequestsController`/`AdminStageRequestsService` pair in the stages module.
- `apps/web`: a desktop `StageRequestsPage` at `/admin/stage-requests` (tabs "Toutes / Sans référent / Prêtes à valider" with counts, client-side search by student or organism name, coloured structure-type label, empty state), with a "Demandes à traiter" menu entry; both exist only when the flag is on.
