# ADR-0011 — `Semester` as a Prisma/Postgres enum, derived from periods

- Status: Accepted
- Deciders: dev
- Related: BR-04b, ADR-0008 (StagePeriod), ADR-0009 (half-open intervals)

## Context

`Stage.semester` and `ReferentAssignment.semester` were typed `Int` with a
comment "1 or 2". Nothing at the database level prevented a value of `3`, and the
semester of a stage was implicitly editable even though BR-04b says it is a
function of the stage's periods.

## Decision

1. Introduce a Prisma enum, which generates a native PostgreSQL enum:

   ```prisma
   enum Semester {
     S1
     S2
   }
   ```

   Both `Stage.semester` and `ReferentAssignment.semester` use this type. The
   domain is closed at the database level; Zod derives from it via
   `z.nativeEnum(Semester)`.

2. `Stage.semester` is **derived, never entered**. It is computed from the
   stage's periods on every write that touches periods:
   - all periods in semester 1 → `S1`
   - all periods in semester 2 → `S2`
   - periods straddling both semesters → `S1` wins (BR-04b)

   Any client-supplied `semester` is ignored.

## Consequences

- A `Stage` can never hold a semester inconsistent with its periods.
- The derivation function lives in `packages/shared` (it depends on the half-open
  interval logic from ADR-0009) and is unit-tested on the straddle case.
- `ReferentAssignment.semester` is entered by the admin (it is an assignment, not
  a derived value), but is constrained to `S1` / `S2` by the same enum.
- A native enum was chosen over `Int + CHECK (semester IN (1,2))`: the enum is
  self-documenting, typed end-to-end, and does not require raw-SQL CHECK
  maintenance. CHECK constraints are reserved for cross-column invariants an enum
  cannot express (e.g. `endDate >= startDate`).
