# ADR-0009 — Temporal bounds as half-open intervals `[start, end)`

- Status: Accepted
- Deciders: dev
- Supersedes: the explicit "1-minute gap" formulation previously in BR-05c

## Context

The calendar rules for school years and semesters were originally expressed with minute-precision point boundaries:

- school year boundary at `01 September 00:01`
- semester 1 end at `01 January 00:01`
- semester 2 end at `31 August 23:59`
- a deliberate 1-minute gap between `31 August 23:59` and `01 September 00:01`

`StagePeriod.startDate` / `endDate` are `DateTime` values with second/millisecond precision. Mixing minute-precision boundaries with higher-precision instants creates ambiguous frontier cases (e.g. what school year owns `2024-08-31T23:59:30`?) and makes the "gap" behave as an untested edge rather than a clear rule.

## Decision

Model every school-year and semester span as a **half-open interval** `[start, end)` — lower bound included, upper bound excluded.

- School year `YYYY-YYYY+1` = `[YYYY-09-01T00:00:00, (YYYY+1)-09-01T00:00:00)`.
- Semester 1 = `[YYYY-09-01T00:00:00, (YYYY+1)-01-01T00:00:00)`.
- Semester 2 = `[(YYYY+1)-01-01T00:00:00, (YYYY+1)-09-01T00:00:00)`.

Consecutive years and the two semesters of a year **tile** their parent span exactly: no gap, no overlap. Every instant belongs to exactly one school year and exactly one semester.

The explicit 1-minute gap is **removed**: the excluded upper bound makes any gap unnecessary. BR-05c becomes `endDate < (YYYY+1)-09-01T00:00:00`.

## Consequences

- Boundary tests are unambiguous: `2025-09-01T00:00:00` belongs to `2025-2026`, not `2024-2025`; a period with `endDate = 2025-09-01T00:00:00` is rejected.
- All comparisons use `<` on the upper bound and `>=` on the lower bound; no minute-level magic constants remain in the code.
- The membership logic (year of an instant, semester of an instant) lives in the shared package and is reused by both `apps/api` and `apps/web`.
