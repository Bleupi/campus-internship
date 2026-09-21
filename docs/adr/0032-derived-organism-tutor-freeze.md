# ADR-0032 — The freeze of a host organism / tutor is derived, not stored

- Status: Accepted
- Date: 2026-09-20
- Deciders: project owner
- Related: ADR-0003 (stage snapshot), ADR-0007 (optimistic locking), BR-08, BR-14

## Context

A student creates a `HostOrganism` and a `Tutor` inline while filling a draft (issue #113), and other students can then pick them from the search. Issue #116 lets the student correct the row they created, but only while doing so cannot change what someone else sees: once a second student's `DRAFT` references the row, or once any stage referencing it leaves `DRAFT` (submit, validate, refuse), the row is "frozen" and a correction must create a new row instead (BR-14).

`Stage` already keeps `organismId` / `tutorId` as reporting FKs, so "who references this row, and in what state" is answerable from data we already store. The question is whether the freeze also gets its own stored state.

## Decision

**The freeze is derived on demand from the referencing stages; there is no `frozen` column.**

A row is frozen when at least one stage other than the editing student's own `DRAFT`s references it:

```
count(Stage where organismId = X and NOT (status = DRAFT and studentId = S)) > 0
```

(`tutorId` for a tutor.) The check runs inside the same transaction as the write, and the same predicate computes the `editable` flag returned to the wizard, so the UI hint and the server enforcement cannot drift apart.

An `edit` is further restricted to the organism/tutor the draft currently points to: an unreferenced row would otherwise pass the check for anyone.

## Consequences

- Both triggers hold by construction. A second student picking the row, and a referencing stage leaving `DRAFT` through any path (including validate/refuse, not built yet), freeze it without any transition code. Submit, validate and refuse need no change.
- There is nothing to migrate or backfill, and no state that can disagree with the stages.
- One extra `count` per organism/tutor on an edit and on each read of a `DRAFT`. Negligible at this scale (a student has a handful of stages).
- **Known race.** Two requests can interleave between the check and the write (a second student picks the row while the first student's edit commits). The window is one transaction wide and the effect is a correction to a row that had just become shared; it is not closed with row locks. If it ever matters, `SELECT ... FOR UPDATE` on the row in the edit path is the non-breaking fix.
- The rule is per row, not per student: a row a student created and shared only with their own other drafts stays editable.

## Alternatives considered

- **A stored `frozenAt` / `isFrozen` column.** Rejected: every path that moves a stage out of `DRAFT`, and every path that attaches a second student, would have to remember to set it. A missed path silently lets a shared or archived organism be rewritten, which BR-08 exists to prevent. It also duplicates information already in the FKs.
- **A reference count column.** Same drawback as the flag, plus it must be decremented when a stage changes organism.
- **Never allow editing; always create a new row.** Rejected by the ticket: it litters the shared organism search with near-duplicates for every typo.
