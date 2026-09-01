# Roadmap — V2 and beyond

> **DO NOT IMPLEMENT — OUT OF V1 SCOPE.** This file exists to park future ideas so they leave the V1 scope clean and so the code assistant does not implement them by accident.

## Period synthesis calendar (front-end)

A visual calendar in the stage form that highlights the selected weeks across the chosen periods, plus a computed summary ("Total duration: 3 weeks"). V1 ships the plain dynamic list of period rows; this is the richer visualization.

## Hours worked per period

Add `hoursWorked` (or similar) to `StagePeriod`, entered by the student per period. **This will bump `snapshotVersion`**: old snapshots stay at their current version without the field; new snapshots include it. This is the canonical justification for keeping `snapshotVersion` in V1.

## AdminProfile

Not created in V1 (an admin is just a `User` with the `ADMIN` role). When admin display/configuration settings are needed, add a 1-1 `AdminProfile` table. This is a **non-destructive migration** (new table, nothing changed). See ADR-0002.

## OrganismService

Introduce an `OrganismService` table to model services as first-class entities and **link tutors to the services of a single organism**. In V1 the service is a text field on `Stage`.

Migration path (non-destructive, see ADR-0006):

1. Add `OrganismService` table.
2. Add nullable `serviceId` on `Stage` and on `Tutor`.
3. Backfill: for each organism, de-duplicate the textual `service` values from its stages, create `OrganismService` rows, set `serviceId`.
4. Keep the text `service` column during transition, remove later.

Watch-out: textual services written inconsistently ("Cardiologie" vs "cardiologie" vs "Service de cardiologie") will create duplicates at migration time — normalize in the backfill script or clean up manually. Low risk, no blocker.

## Presigned upload URLs

Let the front-end upload files directly to the bucket via presigned URLs; the backend only signs. Cleaner and more scalable than proxying uploads through the API. V1 can proxy uploads to keep things simple.

## Student-facing document preview/download

Let a student view or re-download their own previously uploaded `ID_PHOTO`/`INSURANCE_CERTIFICATE` from the profile screen. V1's `GET /students/me/profile` returns file metadata only (type, upload date, MIME type) — no content-retrieval endpoint on the student side. (The admin certificate-validation flow, issue #13, still needs its own `GetObject`-backed read path to review a submitted certificate; that's in scope there and unrelated to this deferral, which is specifically about the student re-viewing their own files.)

## Local/dev cleanup for test-uploaded certificates

`FilesService` has no `delete` method — nothing removes an object from the bucket once uploaded. In particular, the `students.e2e-spec.ts` suite (issue #11/#17) uploads real insurance-certificate/ID-photo bytes to the local MinIO bucket on every run, and Prisma's cascade delete (`User` → `StudentProfile` → `FileObject`) only cleans up the DB rows, not the underlying bucket objects — so repeated local/CI test runs accumulate orphaned objects in MinIO indefinitely. Needs its own design pass: likely a `FilesService.delete(key)` plus an e2e teardown hook that calls it for whatever it uploaded, scoped to non-production only.

## University email verification at student signup

When a student account is created, send a verification email with a code to confirm the address is a genuine university email, before the account can be used. V1 has no such check. This is an application-level access control (who can ever obtain a valid account), noted here alongside ADR-0022's database-credential discussion because it was raised in that context — but it doesn't affect the database credential itself, which only the API holds and no student account, verified or not, is ever exposed to; don't treat it as a substitute for that ADR's residual risk.

## Partially automated insurance-certificate content verification

Assist the admin's certificate-validation queue review (see the admin certificate-validation-queue design, wayfinder map issue #4) by surfacing/highlighting specific terms inside the uploaded PDF (e.g. "stages conventionnés", the current school year) instead of leaving the full read to the admin. V1 is a fully manual visual check — insurers issue this document in enough different formats (per the client's own archives) that even naming a canonical "expected format" is risky; V2 would need real design work on what "found" vs "not found" means before it can assist rather than mislead.

## Production file deletion

No path exists to remove a `FileObject`'s underlying bucket content in production (e.g. when an admin needs to purge a file, or a GDPR-style erasure request). Distinct from the dev-cleanup item above: this is a real, audited deletion capability, not a test-teardown convenience. Needs its own design pass: whether it's triggered automatically (e.g. old object removed on re-upload) or only ever by an explicit admin action, whether the `FileObject` row is hard- or soft-deleted, and how it's authorized/audited.
