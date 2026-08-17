# Business Rules

> Isolated, numbered business rules referenced across `userFlow.md` and the
> codebase. Each rule should map to a testable unit.

## Calendar & school year

**BR-01 — School year boundary.**
A school year `"YYYY-YYYY"` spans the half-open interval
`[YYYY-09-01T00:00:00, (YYYY+1)-09-01T00:00:00)`, lower bound included, upper bound excluded. Any instant is assigned to exactly one school year, with no gap and no overlap between consecutive years. (e.g. `2024-2025` =
`[2024-09-01T00:00, 2025-09-01T00:00)`.)

**BR-05a — Semester 1 span.**
Semester 1 of school year `YYYY-YYYY+1` is the half-open interval
`[YYYY-09-01T00:00:00, YYYY+1-01-01T00:00:00)`.

**BR-05b — Semester 2 span.**
Semester 2 is `[YYYY+1-01-01T00:00:00, YYYY+1-09-01T00:00:00)`. Together the two semesters exactly tile the school year: no gap, no overlap.

**BR-05c — Stage end bound.**
A stage period must satisfy `endDate < (YYYY+1)-09-01T00:00:00`, i.e. it must end strictly before the start of the next school year.The previous "1-minute gap" formulation is removed: the half-open interval model makes any explicit gap unnecessary — the upper bound is simply excluded.

## Stage constraints

**BR-04b — Semester is derived, never entered.**
`Stage.semester` is computed, never accepted as input. It is derived from the stage's periods: if all periods fall in semester 1 → `S1`; if all in semester 2 → `S2`; if the periods straddle both semesters → `S1` wins. The value is (re)computed on every write that touches periods (create, add/edit/remove period). Any client-supplied semester is ignored.

**BR-04b — Semester assignment when straddling semesters.**
If a stage straddles both semesters, **semester 1 applies**.

**BR-04c — Work periods.**
A stage has one or more `StagePeriod`. Constraints:
- at least one period
- `endDate >= startDate` for each period
- no overlap between periods
- all periods within the same school year (BR-04a)
- no period ends on or after `01 September 00:00:00` of the next school year (BR-05c, half-open bound)

## Profile & submission

**BR-02 — Submission requires a valid profile.**
A stage request can be **submitted** only if the student profile is `VALID`
(insurance certificate verified by the admin). Drafts can be created at any
profile status.

**BR-06 — Yearly / semester reset via lazy evaluation.**
- Students: at each login, verify the profile is up to date for the current
  school year; if not, force update of promotion, school year, insurance
  certificate (profile → `EXPIRED` / `INCOMPLETE` as appropriate).
- Referents: assignments reset every year and every semester. Because
  assignments are keyed on `(student, schoolYear, semester, mandatory)`, a
  student may need up to two referents per semester (one for the mandatory
  stage, one for the optional). In the admin panel, show a warning when a
  referent is missing for any `(student, schoolYear, semester, mandatory)`
  combination that corresponds to a real stage of an L2/L3 student with a valid
  profile for the current year and semester (i.e. don't warn about a combination
  the student has no stage for).

## Validation

**BR-03 — Referent required for validation.**
A stage cannot be validated without a referent assigned to the student for the
stage's school year, semester **and `mandatory` flag** — the assignment is keyed
on all four (`studentId`, `schoolYear`, `semester`, `mandatory`), so a student
may have a distinct referent for their mandatory vs. optional stage in the same
semester. The admin must be able to assign one before validating. This referent
is frozen into the snapshot at validation. Reassigning a referent later (e.g. a
professor falls ill) is an in-place update and never alters a stage already
`VALIDATED`/`REFUSED`, whose referent is frozen in the snapshot (BR-08).

**BR-07 — Notifications.**
On submission, the admin is notified. On validation/refusal, the student is
notified; a refusal email must include the refusal reason.

**BR-08 — Snapshot immutability.**
On `VALIDATED`/`REFUSED`, a Zod-validated, versioned snapshot of all stage
information is frozen. Subsequent edits to related data (organism name, tutor,
etc.) do **not** affect archived stages. Reporting FKs are kept but are not the
display source.

## Concurrency

**BR-09 — Optimistic locking.**
Stage writes use an optimistic `version` counter. A write succeeds only if the
version is unchanged since read; otherwise the admin is asked to reload.
