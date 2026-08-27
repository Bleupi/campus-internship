---
"api": patch
---

Fix uploads (`POST /students/me/profile/id-photo` and `.../insurance-certificate`) returning an unhandled 500 (`NoSuchBucket`) because the MinIO bucket was never provisioned.

- `FilesService.onModuleInit()` now ensures the S3/MinIO bucket exists at boot (`HeadBucket`, `CreateBucket` if missing) — skipped in production, where a missing bucket now fails loud at startup instead of the app silently creating one.
- A new global `S3ExceptionFilter` (mirroring `PrismaExceptionFilter`) translates any `S3ServiceException` into a generic 500 in French instead of leaking the raw AWS error to the client.
