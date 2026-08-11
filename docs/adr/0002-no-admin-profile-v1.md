# ADR-0002 — No AdminProfile in V1 (YAGNI)

**Status:** Accepted

## Context

Once `firstName`/`lastName` are moved onto `User` (ADR-0001), the `AdminProfile`
table would carry no data. It was originally introduced symmetrically with
`StudentProfile` and `ReferentProfile`, but an admin currently has no
admin-specific data — the `ADMIN` role on `User` fully identifies an admin.

## Decision

**Do not create `AdminProfile` in V1.** An admin is a `User` with the `ADMIN`
role. When admin-specific configuration is needed (e.g. display settings), add a
1-1 `AdminProfile` table then.

## Consequences

- One fewer empty table; the schema states only what exists.
- Follows YAGNI (*You Aren't Gonna Need It*): no abstraction built for a
  hypothetical need.
- Adding `AdminProfile` later is a **non-destructive migration** (new table, no
  change to existing data). Tracked in `ROADMAP_V2.md`.

## Alternatives considered

- **Create an empty `AdminProfile` now** for symmetry. Rejected: an empty table
  is noise and implies data that doesn't exist.
