---
"api": minor
"web": minor
"shared": minor
---

Add validating a stage request from "Demandes à traiter" (issue #152, part of #144). `PATCH /admin/stage-requests/:id/validate` (`ADMIN`-only) moves a `PENDING` stage to `VALIDATED` with a single click and no confirmation step: it requires a referent assigned for the stage's exact `(studentId, schoolYear, semester, mandatory)` tuple (BR-03), matches the `version` it was given before writing (BR-09, `STAGE_VERSION_CONFLICT` on a stale one), and freezes the same immutable snapshot shape as refusal (BR-08, ADR-0033), both written in the same conditional update. The student is then emailed (BR-07/BR-11) — institutional address always, personal cc'd when on file, and the stage's referent additionally cc'd visibly (not bcc), so the student and the referent see each other's address — through the existing catch-log-don't-propagate mailer path (ADR-0026): a send failure never rolls back the already-committed decision.

- `MailerService.send()`'s `cc` now also accepts an array of recipients (not just one), for this ticket's two simultaneous cc's; existing single-recipient callers are unaffected.
- `packages/shared`: `validateStageSchema`/`ValidateStageRequest`/`ValidateStageResponse` (no `reason`, unlike `RefuseStageRequest`).
- `apps/api`: `AdminStageRequestsService.validate()`, reusing ADR-0033's snapshot schema and the existing `STAGE_NOT_PENDING`/`STAGE_NO_REFERENT`/`STAGE_VERSION_CONFLICT` conflict codes.
- `apps/web`: a "Valider" action alongside "Refuser" on each row of "Demandes à traiter", disabled (with a hint) without a referent; validates immediately on click. A 409 shows the same reload toast as a refusal conflict; any other failure shows an inline retry alert.
