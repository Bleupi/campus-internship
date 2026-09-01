# ADR-0023 — Status-conditioned `updateMany` for `StudentProfile` concurrency

**Status:** Accepted

## Context

`ProfileStatus` is a state machine (ADR-0004): admin actions "validate" and "reject" move a `StudentProfile` between statuses (`PENDING_VALIDATION → VALID`, `PENDING_VALIDATION`/`VALID → INCOMPLETE`). Two concurrent admin actions on the same profile — e.g. one admin validating while another rejects — must not race to a silent last-write-wins, and the loser must get a clear conflict response rather than an inconsistent status.

`Stage` already has a documented concurrency strategy (ADR-0007, BR-09): a `version: Int` counter, checked and incremented on every write, because a `Stage` write can touch an arbitrary set of mutable fields and the whole row's staleness needs guarding.

`StudentProfile`'s admin transitions are narrower: the only thing a concurrent call can race on is the `profileStatus` field itself — each transition is conditioned on and mutates that one column. Reusing the `version`-counter pattern here would add a column whose only job is to detect exactly the staleness that the status field already encodes.

## Decision

Guard `StudentProfile` transitions with a **status-conditioned `updateMany`**: the expected source status(es) go in the `WHERE` clause of the same atomic `UPDATE`, not in a preceding `findUnique` check.

```ts
const { count } = await prisma.studentProfile.updateMany({
  where: { id: studentId, profileStatus: { in: VALIDATABLE_STATUSES } },
  data: { profileStatus: "VALID" },
});
```

If `count === 0`, a follow-up read distinguishes "no such profile" (404) from "profile exists but is in the wrong status" (409) — the losing side of a race always lands in the latter case, since the winner has already moved the row out of the eligible source status.

This is a **narrower special case**, not a replacement for BR-09/ADR-0007: it applies only where the field being raced on and the field guarding the write are the same discrete column. It does not generalize to writes touching multiple independently-mutable fields.

## Consequences

- No new column on `StudentProfile` — the status field itself is the concurrency guard.
- Two concurrent admin transitions on the same profile can't both succeed: the `WHERE`-clause status check and the `UPDATE` are one atomic statement, so there's no read-then-write race window.
- The pattern is specific to state-machine-shaped writes where "the version that matters" _is_ the status. If a future `StudentProfile` write needs to atomically guard more than the status (e.g. multiple fields conditioned on more than status), revisit — a `version` counter may become warranted then.
- `Stage` keeps `version`-based optimistic locking (ADR-0007) unchanged; the two strategies coexist deliberately, each fitted to its model's write shape.

## Alternatives considered

- **`version` counter, à la BR-09/ADR-0007.** Rejected: a version counter exists to protect an arbitrary, multi-field write against staleness. Here the entire race surface is one column, already present — adding `version` would duplicate what `profileStatus` already tracks.
- **Pessimistic locking.** Rejected for the same reasoning as ADR-0007: at the 1-2 admin scale, lock-acquisition machinery costs more than the conflict probability justifies.
- **Read-then-write (`findUnique` then `update`).** Rejected: leaves a window between the read and the write where two concurrent calls can both read an eligible status and both proceed to write — the exact race this ADR exists to close.
