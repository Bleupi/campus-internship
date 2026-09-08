---
"api": minor
"shared": minor
"web": minor
---

`StudentProfile` gains a `refusalReason` field (BR-12, issue #66): the reason an admin types when rejecting a profile is now persisted, not just emailed. It's shown on the student's profile page as its own distinct banner, only when present, and never alongside the generic "profile incomplete" message.

- `packages/shared`: `StudentProfileResponse` gains `refusalReason: string | null`.
- `apps/api`: `AdminStudentsService.rejectProfile` now writes the reason to the profile (previously only used to compose the notification email); `validateProfile` explicitly clears it. `StudentsService`'s existing completion/resubmission transition (`INCOMPLETE`/`EXPIRED` → `PENDING_VALIDATION`) also clears it, so a stale reason never survives a resubmission (via either an edit or a file upload).
- `apps/web`: `ProfilePage` renders the reason as an error-severity banner, mutually exclusive with the existing "profil incomplet" warning.
