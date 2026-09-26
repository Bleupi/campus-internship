---
"api": minor
"web": minor
"shared": minor
---

Show the student's previous validated mandatory stages in the admin request detail (issue #154, part of #144). `GET /admin/stage-requests/:id` now also returns `previousMandatoryStages`: every other stage of the same student that is `mandatory` and `VALIDATED`, most recent decision first, read from each one's frozen snapshot (ADR-0033, BR-08) so a later edit to the live organism or the student's current promotion never changes what is shown. Lets the admin check the student isn't repeating a placement and see which year of study each prior stage was done in.

- `packages/shared`: `AdminPreviousMandatoryStage` and `AdminStageRequestDetailResponse.previousMandatoryStages`.
- `apps/api`: `AdminStageRequestsService.getById()` fetches the student's other `VALIDATED`/`mandatory` stages and maps each frozen snapshot; a stage whose snapshot is unreadable is skipped and logged rather than failing the whole detail request (same precedent as the "Demandes à traiter" list's own snapshot handling).
- `apps/web`: a new "Stages obligatoires précédents" section on the request detail, showing promotion/semester/school year, the same coloured structure-type label used elsewhere, organism and service per entry; an empty state when there are none.
