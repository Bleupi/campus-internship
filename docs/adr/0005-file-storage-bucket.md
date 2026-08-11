# ADR-0005 — Files in a bucket, metadata in DB, 1-N FileObject

**Status:** Accepted

## Context

Students upload an ID photo (JPEG/PNG) and an insurance certificate (PDF, yearly
expiry). We must decide where binaries live and how they attach to the student
profile. More file types are expected later (certificate history, other docs).

## Decision

**Binaries live in an object store** (S3 in prod; MinIO in local dev, both
S3-compatible). The database stores **metadata only**: `bucketKey`, `mimeType`,
`sizeBytes`, `expiresAt`, `uploadedAt`, `type`.

`FileObject` carries `studentProfileId` + `type` in a **1-N relation** (the
profile has many files). Adding a new file type is a new `FileType` enum value —
**no schema change**. The "exactly one valid insurance certificate" rule is
enforced in application logic (take the most recent non-expired), which also
enables a certificate history later.

## Consequences

- DB stays small; backups and migrations are unaffected by binary size.
- Storage is portable: same S3 API in dev and prod.
- One relation regardless of how many file types exist; `file → student`
  navigation works.
- Uniqueness of "one id photo" is not enforced by the schema but by application
  logic — acceptable and intended.
- Enables presigned-URL uploads later (ROADMAP_V2).

## Alternatives considered

- **Store binaries in Postgres (`bytea`).** Rejected: bloats the DB, slows
  backups, complicates migrations; not standard practice.
- **Local filesystem on the server.** Rejected: doesn't survive container
  redeploys, doesn't scale.
- **Strict 1-1 relations per file type (named relations).** Rejected as the
  default: verbose, and grows a FK + inverse + relation name per new type. Kept
  only as an option if a hard "exactly one" schema guarantee were required.
