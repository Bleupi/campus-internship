---
"api": minor
"web": minor
"shared": minor
---

Add student profile view, edit and file uploads (issue #11).

- `packages/shared`: a `schoolYearSchema` value-object (`^\d{4}-\d{4}$`, second year = first + 1) plus `getCurrentSchoolYear()`, the single implementation ADR-0012 requires — `StudentProfile.profileYear` now goes through it. `updateProfileSchema` (partial patch: `promotion`/`phone`/`personalEmail`) and `students.contract.ts` (`StudentProfileResponse`, file metadata only — no `bucketKey`, per the V1 no-download-in-app decision already recorded in `docs/ROADMAP_V2.md`).
- `apps/api`: `GET`/`PATCH /students/me/profile`, `POST /students/me/profile/id-photo` and `.../insurance-certificate` (Multer, MIME/size-limited per `docs/dataModel.md` § Files). `StudentsService` derives the `INCOMPLETE → PENDING_VALIDATION` completion transition (promotion + both files present, fixes `profileYear`) and the `VALID → PENDING_VALIDATION` regression (promotion changed, or the insurance certificate re-uploaded) — editing phone/personalEmail alone never touches `profileStatus`. Each upload always inserts a new `FileObject` row; the "current" file per type is the most recent one (expiry itself is deferred to #12/BR-06). A new `FilesService` wraps `@aws-sdk/client-s3` for MinIO-locally/S3-compatible-in-prod object storage (ADR-0020). First route in the app to combine `@UseGuards(RolesGuard)` with `@Roles("STUDENT")`.
- `apps/web`: a `/profile` screen (`features/students/ProfilePage.tsx`) — one component, `react-hook-form` + the shared Zod schema, toggling between a read view and an edit form (`isEditing`, defaulting to edit mode when `INCOMPLETE`). "Remplacer" file buttons are always visible and upload immediately on selection. A confirmation dialog gates the two actions that would regress a `VALID` profile (changing promotion, replacing the insurance certificate) before the request fires. Reachable from the existing `/dashboard` placeholder via a new "Mon profil" link. `apiClient` gained a `postForm` method for multipart uploads.
