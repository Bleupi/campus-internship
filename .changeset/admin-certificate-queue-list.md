---
"api": minor
"shared": minor
"web": minor
---

Add the admin certificate-validation queue list (issue #42, first slice of #41): `GET /admin/students/certificate-queue` returns every `PENDING_VALIDATION` `StudentProfile`, oldest-`updatedAt`-first, with student identity, promotion and the current `INSURANCE_CERTIFICATE` metadata (`uploadedAt`, `mimeType` — no file bytes). `ADMIN`-only via `RolesGuard`; no pagination at this scale (~300 rows).

- `packages/shared`: `CertificateQueueEntry`/`CertificateQueueResponse` in `admin.contract.ts`.
- `apps/api`: a new `AdminStudentsQueueController`/`AdminStudentsQueueService` pair alongside the existing admin-students controller.
- `apps/web`: a desktop split-pane `CertificateQueuePage` (list + student-info detail pane; certificate rendering and Valider/Refuser land in ticket 2), a new `/admin/certificate-queue` route gated by role, and a nav link shown only to `ADMIN` users.
