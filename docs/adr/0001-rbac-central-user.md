# ADR-0001 — RBAC with a central User and multiple roles

**Status:** Accepted

## Context

Four kinds of people exist in the domain: student, admin, referent, tutor. Three of them authenticate (student, admin, referent); the tutor never logs in. The domain lexicon explicitly allows an admin to also be a referent. Modeling each person as a separate table with its own login would duplicate authentication (email/password) three times and make the "admin who is also a referent" case awkward (two logins? which one?).

## Decision

Use **Role-Based Access Control**. A single authenticatable `User` entity holds `email`, `passwordHash`, `firstName`, `lastName`, and a `roles: Role[]` array (`STUDENT`, `ADMIN`, `REFERENT`). Role-specific data lives in 1-1 profile tables (`StudentProfile`, `ReferentProfile`).

An admin-referent is **one `User`** with `roles = [ADMIN, REFERENT]` and **two profiles** (`adminProfile` — deferred, see ADR-0002 — and `referentProfile`). The role array says what the user may do; each profile holds the data attached to that hat. `firstName`/`lastName` live on `User` so the two hats never diverge.

The tutor stays a plain `Tutor` table with no authentication.

## Consequences

- Single source of truth for identity and name.
- The admin-referent case is natural: two roles, referent data attached via `referentProfile`, no duplicated login.
- Slightly more indirection (User → profile) than flat tables.
- Extensible: new roles are new enum values + optional profile tables.

## Alternatives considered

- **Separate person tables with duplicated auth.** Simpler to write initially, but duplicates login logic three times and handles the admin-referent overlap poorly. Rejected.
