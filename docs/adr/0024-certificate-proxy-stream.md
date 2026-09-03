# ADR-0024 — Certificate download: proxied stream, never a presigned URL

- Status: Accepted
- Date: 2026-09-02
- Deciders: project owner

## Context

Issue #43 gives the admin an inline view of a selected student's `INSURANCE_CERTIFICATE` `FileObject` (the "attestation de responsabilité civile", see `CONTEXT.md`) directly in the certificate-validation queue (#41/#42). The bucket that holds it (ADR-0005) is otherwise never exposed to the browser: every read and write to student data goes through the API's `JwtAuthGuard` + `RolesGuard` stack.

Two ways exist to hand the browser those bytes:

1. **Presigned URL.** The API asks the S3-compatible store (`@aws-sdk/client-s3`, ADR-0020) for a time-limited signed `GetObject` URL and returns it to the client, which then fetches the object directly from the bucket.
2. **Proxied stream.** The API itself calls `GetObjectCommand` and streams the response body straight through as the HTTP response, never exposing a bucket URL to the client.

## Decision

**Proxy the certificate through the API — never issue a presigned URL.**

`FilesService` (previously `upload()`-only, ADR-0020) gains a `download(key): Promise<Readable>` method. `AdminStudentsService.getCertificateStream(studentId)` looks up the student's current non-expired `INSURANCE_CERTIFICATE` `FileObject` (same "most recent non-expired row of this type" rule as `StudentsService.currentFiles()`), 404s if none exists, and otherwise calls `FilesService.download()`. The controller (`GET /admin/students/:id/profile/certificate`, guarded by the same `RolesGuard(ADMIN)` as `validate`/`reject`) wraps the resulting stream in Nest's `StreamableFile`, typed from the `FileObject.mimeType` already stored in Postgres — no second round-trip to the bucket for content type.

The frontend fetches this route as a `Blob` through the existing authenticated `api-client.ts` (so its 401-retry-once refresh interceptor still applies) and renders it via `URL.createObjectURL()`, never a raw `<embed src="...">` pointed at the API URL directly (which would bypass that silent-refresh flow).

## Consequences

- Every certificate read passes through the app's own auth stack on every request — a bucket credential leak or a guessed/shared URL can't expose a certificate the way a presigned URL (even a short-lived one) could.
- No new IAM surface: the app's existing S3 credentials (already used for `upload()`) are sufficient; presigned URLs would need `GetObject`-signing capability wired through the same credentials anyway, so this isn't a capability trade, only an exposure trade.
- The API's request/response cycle now carries binary payload through Node for the duration of the download, instead of the browser fetching straight from the bucket. Acceptable at this project's scale (one certificate at a time, admin-only, `NestJS`/Express happily streams `Readable` bodies without buffering the whole file in memory).
- `AdminStudentsService` gains a dependency on `FilesService` (via `FilesModule` imported into `AdminModule`) — the first cross-module dependency for this service.

## Alternatives considered

- **Presigned `GetObject` URL.** Rejected: bypasses the API's guard stack for the actual data transfer — anyone holding the URL (logged, cached, shared) can fetch the certificate for as long as it's valid, with no way to revoke a single link early. Also the exact anti-pattern presigned _uploads_ were deferred for in ADR-0020 (validation/authorization moving off the server) — the same argument applies to downloads of a document that must stay admin-only.
- **Signed cookie / CDN-level auth in front of the bucket.** Rejected: adds a second auth mechanism (bucket-level) alongside the app's own JWT guards, for a single low-traffic admin route — pure infrastructure overhead with no benefit at this scale.
