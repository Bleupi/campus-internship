---
"api": minor
"shared": minor
"web": minor
---

Duplicate a stage request (issue #117). `POST /stages/:id/duplicate` creates a brand-new `DRAFT` from any of the caller's own requests, whatever its status, copying the organism, tutor, service, project type, motivation, `mandatory`, school year and every period, and linking it to the source through `parentStageId`. The submission date, refusal reason, snapshot and snapshot version are never carried over, and another student's stage answers 404. The referent is not copied: it stays derived from the `(schoolYear, semester, mandatory)` assignment (ADR-0003, BR-03).

- `packages/shared`: `DuplicateStageResponse`.
- `apps/api`: `StagesService.duplicate` and `POST /stages/:id/duplicate`.
- `apps/web`: a "Dupliquer" icon button on every row of the desktop "Mes demandes" table (the new draft appears in the refetched list), and a "Dupliquer" button on the detail page for every status, which opens the new draft.
