---
"api": minor
"web": minor
"shared": minor
---

Let a student submit a draft stage request (issue #115). `POST /stages/:id/submit` moves an owned `DRAFT` to `PENDING`, sets `submittedAt`, and emails every `ADMIN` user (BR-07). It rejects a profile that isn't `VALID` (BR-02) and an incomplete request (organism, tutor, service, project type, motivation, at least one valid period), guards the write on status and `version` (BR-09), and answers 409 for a stage that is already submitted. The detail page's "Soumettre" button is disabled with the specific reason, computed by the same `getSubmissionBlockers()` now exported from `shared`.
