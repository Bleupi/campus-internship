---
"api": minor
"shared": minor
"web": minor
---

Edit a stage draft with optimistic locking (issue #116, BR-09, BR-14). `PATCH /stages/:id` replaces a `DRAFT`'s wizard content, requires the `version` the client read (a stale one answers 409 `STAGE_VERSION_CONFLICT`) and re-derives `semester` (BR-04b). The student can also correct the `HostOrganism`/`Tutor` their draft points to, while that row is unfrozen: referenced only by their own `DRAFT` stages. The freeze is derived from the referencing stages, not stored (ADR-0031); a frozen row answers 409 `STAGE_ROW_FROZEN`, and a new `Tutor` can always be added to a frozen organism.

- `packages/shared`: `updateStageDraftSchema` (`existing` / `new` / `edit` per organism and tutor), `version` and per-row `editable` on the stage responses, `STAGE_CONFLICT_CODES`.
- `apps/api`: `StagesService.updateDraft` and `PATCH /stages/:id`.
- `apps/web`: the wizard is split into a shared `StageWizard` with `NewStagePage` and `EditStagePage` wrappers; a pen button on "Mes demandes" (and on the detail page) for drafts; a reload prompt on a version conflict; frozen rows steer the student to create a new organism/tutor.
