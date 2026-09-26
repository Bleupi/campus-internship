---
"api": minor
"web": minor
"shared": minor
---

Students can read their own decided stage requests (issue #162, BR-08, ADR-0033). `GET /stages/:id` no longer answers 501 for a `VALIDATED`/`REFUSED` stage: it serves it from its frozen snapshot, in the same detail shape as a live stage (the referent comes from the snapshot, organism and tutor are read-only), so later edits to the organism, tutor or referent assignment never reach it. A decided stage whose snapshot is missing, of an unknown version or unparseable answers 500, logged with the stage id, never a fallback to the live rows.

- `GET /stages` reads a `DRAFT`/`PENDING` stage from its live rows and a decided one from its snapshot (organism name, school year, semester, kind, periods). An unreadable snapshot is logged and the row is still listed, without an organism name or periods, so one corrupt stage cannot blank the student's list.
- `packages/shared`: `StageDetailResponse` gains `decidedAt` (null while live). The deciding admin and the student's promotion, frozen in the snapshot, are never exposed to the student.
- `apps/web`: the detail page shows the decision date of a decided stage, and the list shows its organism name instead of the "Organisme indisponible" placeholder.
