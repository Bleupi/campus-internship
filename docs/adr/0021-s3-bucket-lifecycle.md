# ADR-0021 — S3/MinIO bucket lifecycle: provisioned by the app outside production

- Status: Accepted
- Date: 2026-08-27
- Deciders: project owner

## Context

ADR-0020 picked `@aws-sdk/client-s3` as the object-storage client but left the bucket's own lifecycle unaddressed. In practice `docker-compose.yml`'s `minio` service started with zero buckets, and nothing else in local dev/CI provisioned one — the first real upload (issue #11's student ID-photo/insurance-certificate endpoints) failed with an uncaught `NoSuchBucket`, surfacing as an unhandled 500 (found during PR #17 review). This ADR settles who is responsible for making sure `S3_BUCKET` exists before anything is written to it, and how a still-missing bucket is reported.

Also relevant: `apps/api/test/*.e2e-spec.ts` boots `AppModule` directly (`Test.createTestingModule({ imports: [AppModule] }).compile()`), not via `docker-compose.yml` — whatever provisions the bucket has to work under that boot path too, since e2e coverage for the upload endpoints (a separate open item) depends on it.

## Decision

`FilesService.onModuleInit()` (a Nest lifecycle hook, runs once per app boot) checks the bucket with `HeadBucketCommand`:

- If it exists, nothing to do.
- If `HeadBucketCommand` reports `NotFound` and `process.env.NODE_ENV !== "production"`, the service creates it with `CreateBucketCommand` (idempotent: a `BucketAlreadyOwnedByYou` race between two instances booting concurrently is swallowed).
- If `NotFound` and `NODE_ENV === "production"`, the original error is re-thrown — app boot fails loud rather than silently creating a bucket against a real S3-compatible provider.

Any S3 error surfacing later (e.g. during an actual `PutObjectCommand`) is caught by a new global `S3ExceptionFilter` (`apps/api/src/common/filters/s3-exception.filter.ts`, mirroring the existing `PrismaExceptionFilter`) and translated into a generic French 500 instead of leaking the raw AWS error to the client.

## Consequences

- Local dev and e2e tests need zero extra setup: `docker-compose.yml` is untouched (no init container, no healthcheck), and any `AppModule`-booting e2e spec provisions the bucket itself on `app.init()` — same for any CI runner hosting MinIO, whichever way MinIO itself gets started there.
- In production, the app's S3 credentials never need `s3:CreateBucket` — only `HeadBucket`/`PutObject`/`GetObject`/`DeleteObject` on the one bucket, provisioned once out-of-band (Terraform/console). A missing bucket in prod is a boot-time crash, not a runtime 500 on the first upload.
- `onModuleInit` throwing happens once per app boot, not per request — no risk of a request-time retry storm; the failure mode is "the app doesn't start," which is the intended loud signal.

## Alternatives considered

- **A `minio/mc` init container in `docker-compose.yml`** (`depends_on` + `healthcheck`, running `mc mb`). Rejected: adds `healthcheck`/`depends_on` to a compose file that currently has neither; doesn't cover e2e tests, which boot `AppModule` directly rather than through docker-compose; and doesn't port cleanly to GitHub Actions' `services:` model, which has no `depends_on`/init-container chaining — the same `mc mb` step would have to be duplicated as a separate CI step, another place for it to drift from `docker-compose.yml`.
- **A manual provisioning step** (`mc mb` or the MinIO console, documented in a README). Rejected: this is exactly the missing step that caused the bug in the first place — an undocumented, forgettable manual step — and it isn't usable non-interactively in CI at all.

## Related

Not a superseding decision — `ADR-0020` is unaffected, the client library choice stands as-is. This fills a gap `ADR-0020` left open (bucket lifecycle), for the same `FilesService`.
