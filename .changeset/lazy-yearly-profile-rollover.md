---
"api": minor
"web": minor
"shared": patch
---

Add lazy yearly profile rollover at login (BR-06, issue #12).

`POST /auth/login` now compares `StudentProfile.profileYear` to the current school year and, on mismatch, applies `VALID → EXPIRED`, `PENDING_VALIDATION → INCOMPLETE`, `INCOMPLETE → INCOMPLETE` before issuing tokens. The response's new `profileStatus` field reflects the (possibly rolled-over) status; it's `null` for a user with no `StudentProfile` (referent/admin). Boundary behavior reuses the existing half-open `getCurrentSchoolYear` (BR-01): a login at exactly `YYYY-09-01T00:00:00.000` rolls over, one at `YYYY-08-31T23:59:59.999` does not.

`StudentsService` previously had no way back out of `EXPIRED` — `nextStatus` only regressed a `VALID` profile to `PENDING_VALIDATION` on a promotion change or certificate re-upload. `EXPIRED` now resolves the same way a fresh `INCOMPLETE` profile completes: on presence (promotion set, id photo and a _current_ insurance certificate), not on delta. That relies on a second fix this issue closes: `FileObject.expiresAt` for an uploaded insurance certificate is now stamped to the current school year's end (half-open, BR-05c/ADR-0009) instead of always `null` — `currentFiles()` already excluded expired files, it just never had one to exclude. Without this, a resubmission with unchanged, stale data (or a promotion-only edit) could silently resolve a rollover without ever renewing the certificate, defeating the point of BR-06.

On the frontend, a new `RequireCompleteProfile` route guard (`apps/web/src/App.tsx`) hard-redirects a `STUDENT`-role user to `/profile` from every other route while their profile is `INCOMPLETE`/`EXPIRED` (or the profile fetch itself errors — fails closed, not open), driven by the live `useProfile()` query so it unblocks itself as soon as the student resolves it — no re-login needed. The "which statuses block navigation" predicate is now a single shared `blocksNavigation()` helper (`packages/shared`) instead of three separately hand-maintained copies. `LoginPage` also reads the new `profileStatus` field to route directly to `/profile` after login, avoiding a dashboard flash. `ProfilePage` gained an `EXPIRED`-specific renewal banner and now forces edit mode for `EXPIRED` the same way it already did for `INCOMPLETE`.

Also fixes an infinite-refetch loop latent in `useProfile()`: when the profile fetch errors, the guard and `ProfilePage` both observe the same query at once, and TanStack Query's default `retryOnMount` made the second observer's mount auto-retry an already-errored query — which resets `status` back to `pending`, hiding the guard's `<Outlet>` (unmounting `ProfilePage`), which then remounts and retries again, forever. `useProfile()` now sets `retryOnMount: false`.
