---
"api": minor
"web": minor
---

Complete the admin certificate-validation queue (issue #43, second slice of #41): from the split-pane queue built in #42, an admin can now read a selected student's uploaded certificate inline and validate or reject it, end to end.

- `apps/api`: `GET /admin/students/:id/profile/certificate` proxies the student's current non-expired `INSURANCE_CERTIFICATE` through the API as a `StreamableFile` (ADR-0024) — never a presigned URL, so every access still goes through `JwtAuthGuard`/`RolesGuard(ADMIN)`. 404 if no current certificate exists. `FilesService` gains `download(key)` alongside its existing `upload()`.
- New `BR-10` (`docs/businessRules.md`): the admin's validate/reject judgment on a certificate's content is a manual visual check in V1, no automated text extraction.
- `apps/web`: the certificate queue's right pane fetches the certificate as a `Blob` through the authenticated `api-client.ts` and renders it inline via `URL.createObjectURL()`. Valider/Refuser reuse the existing `PATCH .../validate`/`.../reject` endpoints (#13); rejecting concatenates checked canned reasons and optional free text into the single `reason` string those endpoints already expect. After either action, the acted-on row leaves the queue and the right pane auto-advances to the next student; a 409 from a concurrent admin action shows a non-blocking toast instead of a hard error.
