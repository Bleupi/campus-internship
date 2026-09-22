---
"api": minor
"shared": minor
"web": minor
---

Add the "Demandes à traiter" row-expand detail (issue #147, third slice of #144): clicking a `PENDING` request expands a three-column panel with everything the student provided — organism with full address, service, project type, full motivation, tutor identity/contact/phone-contact consent, and all periods with their total duration. Missing values show "Non renseigné"; an incomplete organism address is flagged.

- `packages/shared`: `AdminStageRequestDetailResponse` (and its organism/tutor detail shapes) in `stages.contract.ts`.
- `apps/api`: `GET /admin/stage-requests/:id` on the existing `AdminStageRequestsController`, `ADMIN`-only, scoped to `PENDING` (any other status, or an unknown id, is a 404 — the frozen snapshot is the display source once a request is decided, ADR-0003/BR-08).
- `apps/web`: `StageRequestDetail` expandable panel wired into `StageRequestsPage`'s rows, fetched lazily per row; `formatTotalDuration` added alongside the existing period formatters.
