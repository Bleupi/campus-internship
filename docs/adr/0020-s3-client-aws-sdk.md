# ADR-0020 — Object storage client: `@aws-sdk/client-s3`

- Status: Accepted
- Date: 2026-08-24
- Deciders: project owner

## Context

Issue #11 (student profile view/edit) is the first ticket to actually write binary content to the object store that `docs/dataModel.md`/ADR-0005 already reserved: student ID photo and insurance certificate uploads. `.env.example` already anticipates an S3-compatible setup (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`) with MinIO as the local dev target — but no client library has been picked yet, and `apps/api` has no dependency on one.

## Decision

Use `@aws-sdk/client-s3` (AWS SDK for JavaScript v3, S3 client only) inside a small `FilesService` (`apps/api/src/modules/files/files.service.ts`), configured entirely from env:

```ts
new S3Client({
  endpoint, // S3_ENDPOINT — e.g. http://localhost:9000 for MinIO
  region, // S3_REGION
  forcePathStyle, // S3_FORCE_PATH_STYLE — true for MinIO, false for AWS/most providers
  credentials: { accessKeyId, secretAccessKey },
});
```

`FilesModule` exports `FilesService`; `StudentsModule` (and any future module needing object storage) consumes it. One method for this issue: `upload(key, body, contentType)` via `PutObjectCommand`.

## Consequences

- Works unmodified against MinIO locally (`S3_FORCE_PATH_STYLE=true`) and against any S3-compatible provider in production (Scaleway Object Storage, AWS S3 itself, etc.) by only changing env values — no code branch per provider.
- `@aws-sdk/client-s3` is a real, heavier dependency (modular v3 SDK, but still substantial) — accepted given it's the de facto standard client for S3-compatible APIs and the project already committed to S3-compatible storage in ADR-0005.
- `FilesService` stays a thin wrapper (one method today); presigned uploads/downloads (ROADMAP_V2) would be additional methods on the same service, not a new client choice.
- Binary content never touches Nest's request/response JSON pipeline directly — `students.controller.ts` uses Multer's `FileInterceptor` to get a buffer, hands it to `FilesService`, and only metadata goes through Prisma (per ADR-0005/`docs/dataModel.md`).

## Alternatives considered

- **A vendor-specific SDK (e.g. Scaleway's own client).** Rejected: would need swapping in production vs. MinIO locally, or wrapping two SDKs behind an interface for no real benefit — `@aws-sdk/client-s3` already speaks the S3 API both targets implement.
- **The `minio` npm package.** Rejected: MinIO's own JS client is MinIO-specific in spirit even though it also speaks S3; `@aws-sdk/client-s3` is the more portable, more widely used option, and this project's dev-vs-prod split is exactly "S3-compatible everywhere," which is what the AWS SDK is built around.
- **Presigned-URL uploads (browser uploads directly to the bucket).** Rejected for V1: adds a second endpoint (issue presigned URL) and moves validation (MIME type, size) off the server unless duplicated client-side. Deferred to ROADMAP_V2 as already documented; V1 uploads go through the API via Multer.
