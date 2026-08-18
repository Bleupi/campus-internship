# ADR-0014 — Referent assignment keyed on (student, schoolYear, semester, mandatory)

- Status: accepted
- Date: 2026-08-17
- Deciders: project owner
- Related: ADR-0003 (snapshot), ADR-0008 (StagePeriod), ADR-0011 (Semester enum)
- Supersedes: the earlier `(student, schoolYear, semester)` uniqueness

## Context

A `ReferentAssignment` links a student to a referent for a slice of time. The referent of a stage is not a FK on `Stage`; it is derived on the fly from `ReferentAssignment` while the stage is live (`DRAFT`/`PENDING`) and frozen into the snapshot on validation/refusal (see ADR-0003, BR-03).

The initial model made an assignment unique per `(student, schoolYear, semester)` — i.e. one referent per student per semester, regardless of the kind of stage. University practice, however, distinguishes the **mandatory** stage from an **optional** one, and these can legitimately be supervised by different referents within the same semester. The previous key could not represent that: a student's mandatory and optional stage in the same semester were forced to share a referent.

We also needed to answer how a mid-year referent change (e.g. a professor falls ill) behaves against a uniqueness constraint, and whether such a change may disturb stages that are already validated or refused.

## Decision

Add a `mandatory: Boolean` column to `ReferentAssignment` and make the row unique on the four-tuple:

```prisma
@@unique([studentId, schoolYear, semester, mandatory])
```

The `mandatory` value on an assignment matches the `Stage.mandatory` flag of the stages it governs. Referent derivation for a live stage therefore matches on all four axes: `studentId`, `schoolYear`, `semester`, and `mandatory`.

Consequences of this decision:

- **Reassignment is an in-place UPDATE.** Changing a referent (illness, error correction) updates `referentId` on the existing row. The unique tuple is unchanged, so no constraint conflict arises. It is never modelled as a second insert.
- **No history in V1.** An update overwrites the previous referent with no audit trail. This is accepted for V1 (single-digit admin scenario, low churn). An auditable variant — soft-delete via an `archived`/`replacedById` column plus a _partial_ unique index (`WHERE archived = false`, expressed as a raw-SQL migration since Prisma lacks native partial unique indexes) — is deferred to V2 (see ROADMAP_V2).
- **Frozen stages are untouched.** A referent change only affects live (`DRAFT`/`PENDING`) stages, which re-derive the referent. Stages already `VALIDATED`/`REFUSED` keep the referent frozen in their snapshot (BR-08); the new assignment does not reach them.
- **The missing-referent warning becomes per-combination.** BR-06's dashboard warning fires when a referent is missing for a `(student, schoolYear, semester, mandatory)` combination that corresponds to an **existing stage** of an eligible L2/L3 student — not for every theoretically-possible combination, which would produce noise for students who never intend an optional stage.

## Consequences

Updated across the design docs: `dataModel.md` (`ReferentAssignment` model and the `Stage` derivation text), `businessRules.md` (BR-03, BR-06), `userFlow.md` (validation conditions, referent-assignment action, live/archived summary).

A data migration is required: existing `ReferentAssignment` rows predate the `mandatory` column and must be backfilled with a deliberate value **before** the unique constraint is applied, otherwise the migration fails. The backfill policy (most existing assignments map to the mandatory stage) must be decided at migration time.

## Alternatives considered

- **Keep `(student, schoolYear, semester)`.** Rejected: cannot express distinct referents for mandatory vs. optional stages in the same semester — the actual requirement.
- **Replace `semester` with `mandatory`.** Rejected: this was a typo in the original request; it would break BR-03/BR-06 and the whole semester-based reset logic, which must remain.
- **A direct `referentId` FK on `Stage`.** Rejected: contradicts ADR-0003 — the referent is derived while live and frozen only in the snapshot, so it must not be a first-class FK on the live row.
