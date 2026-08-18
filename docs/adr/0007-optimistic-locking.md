# ADR-0007 — Optimistic locking for stage concurrency

**Status:** Accepted

## Context

Multiple admins (currently one, maybe two) may act on stages. We want to prevent two admins' concurrent writes from silently overwriting each other. Two classic strategies exist: pessimistic locking (block the row while one admin holds it) and optimistic locking (allow work, detect conflicts at write time).

Pessimistic and optimistic locking do not meaningfully combine on the same operation: if a pessimistic lock already blocks opening the record, there is nothing left for the optimistic check to guard.

## Decision

Use **optimistic locking** only: a `version: Int @default(0)` counter on `Stage`. A write updates the row only if `version` is unchanged since it was read, then increments it. On mismatch the admin is asked to reload ("this stage was modified"). See BR-09.

## Consequences

- Fits the 1-2 admin scenario, where two admins editing the _same_ stage at the _same_ instant is extremely unlikely.
- Avoids pessimistic-lock machinery: acquiring/releasing locks, orphaned locks when an admin closes a tab, lock timeouts.
- Migration to pessimistic locking later is easy and non-destructive: keep `version` and **add** `lockedByAdminId` + `lockedAt` plus acquire/release logic. Warranted only if the admin count grows significantly.

## Alternatives considered

- **Pessimistic locking now.** Rejected for the current scale: more moving parts and edge cases than the low conflict probability justifies.
- **Both at once.** Rejected as incoherent on a single operation — the pessimistic lock would make the optimistic check redundant.
