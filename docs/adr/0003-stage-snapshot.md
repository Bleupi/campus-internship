# ADR-0003 — Single Stage table with an immutable versioned snapshot

**Status:** Accepted

## Context

A validated or refused stage is an administrative document that must remain
readable and unchanged forever, even if the organism is deleted, the tutor
renamed, or the student unsubscribes. A draft/pending stage, on the other hand,
must stay linked to live data so edits are reflected. The original spec
hesitated between one table and two (drafts vs archived).

## Decision

Use a **single `Stage` table**. While `DRAFT`/`PENDING`, the live relations
(student, organism, tutor, periods) are authoritative and the referent is
computed on the fly from `ReferentAssignment`. On `VALIDATED`/`REFUSED`, freeze
all information into an immutable `snapshot: Json` field, validated by **Zod**
and tagged with `snapshotVersion`. From then on, display reads only the
snapshot.

FKs are kept on archived stages (`onDelete: SetNull`) **for reporting only**
(e.g. "how many stages at organism X"); they are never the display source.

The backend exposes a single read path that branches on status, so the
front-end always receives the same DTO shape:

```
DRAFT | PENDING     -> assemble from live relations (+ compute referent)
VALIDATED | REFUSED -> return snapshot (already the right shape)
```

## Consequences

- Archived stages are self-contained and legally immutable.
- No duplicated table logic, no cross-table queries, no divergence risk.
- `snapshot` is untyped `Json` in Prisma → **must** be validated with Zod on
  write and on read; `z.infer` gives the TypeScript type for free.
- `snapshotVersion` lets old snapshots be read after the shape evolves (e.g.
  when `hoursWorked` is added — see ROADMAP_V2).
- Corrections to related data do not propagate to archived stages — this is the
  intended, correct behaviour for a frozen document (documented, BR-08).

## Alternatives considered

- **Two physical tables (drafts / archived).** Rejected: duplicated logic,
  painful cross-table queries, divergence risk.
- **Keep only live FKs, no snapshot.** Rejected: archived stages would become
  unreadable when related rows change or are deleted.
