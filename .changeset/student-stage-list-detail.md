---
"api": minor
"web": minor
"shared": minor
---

Students can view their own stage requests (behind `FEATURE_STAGE_MANAGEMENT`).

- `GET /stages` lists the caller's own stages, filterable by status and semester, sorted by nearest upcoming start date (default) or by submission date. `GET /stages/:id` reads one stage per ADR-0003: a `DRAFT`/`PENDING` stage is assembled from live relations with the referent derived from `ReferentAssignment` on the exact `(studentId, schoolYear, semester, mandatory)` tuple (BR-03); another student's id is a 404, never a 403. The `VALIDATED`/`REFUSED` snapshot branch is stubbed (501) until a snapshot writer exists.
- New nullable `Stage.submittedAt` column (migration `add_stage_submitted_at`), the sort key for submission date; #115 will set it on submit.
- Web: a request list (dense accordion on mobile, rows with inline actions on desktop; filters and sort kept in the URL) and a full-page detail route showing the referent (or "non assigné") and, for a refused stage, the refusal reason.
