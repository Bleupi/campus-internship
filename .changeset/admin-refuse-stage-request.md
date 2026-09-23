---
"api": minor
"web": minor
"shared": minor
---

Add refusing a stage request from "Demandes à traiter" (issue #151, part of #144). `PATCH /admin/stage-requests/:id/refuse` (`ADMIN`-only) moves a `PENDING` stage to `REFUSED`: it requires a referent assigned for the stage's exact `(studentId, schoolYear, semester, mandatory)` tuple (BR-03), matches the `version` it was given before writing (BR-09, `STAGE_VERSION_CONFLICT` on a stale one), and freezes an immutable snapshot (BR-08) plus a new indexed `Stage.decidedAt` timestamp, both written in the same conditional update. The student is then emailed (BR-07/BR-11) — institutional address always, personal cc'd when on file, the acting admin named "NOM Prénom, <function>", the refusal reason included — through the existing catch-log-don't-propagate mailer path (ADR-0026): a send failure never rolls back the already-committed decision.

- ADR-0033 ("Stage snapshot v1: its shape and read path") lands with this ticket, the first snapshot writer: a Zod schema in `apps/api/src/modules/stages/stage-snapshot.schema.ts` (not `packages/shared` — only the API reads/writes it), dispatched on `snapshotVersion` by `parseStageSnapshot`, so a write that would not read back fails at write time.
- `packages/shared`: `refuseStageSchema`/`RefuseStageRequest`/`RefuseStageResponse`, and `STAGE_CONFLICT_CODES.NOT_PENDING`/`NO_REFERENT` alongside the existing stage-conflict codes.
- `apps/api`: `AdminStageRequestsService.refuse()`, plus a shared `admin-email.util.ts` (BR-11's admin-naming/email-composition helpers, extracted out of `AdminStudentsService` so the rule isn't duplicated between the two writers).
- `apps/web`: a "Refuser" action per row of "Demandes à traiter", disabled (with a hint) without a referent; a dialog with the four recurring reasons — one of them ("Il manque les informations suivantes :") requiring its own detail on the same bullet line — plus an optional free precision, built client-side into the single `reason` string the API expects. A 409 shows a reload toast and the row is dropped from the list on either outcome.
