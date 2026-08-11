# ADR-0008 — Multiple work periods via StagePeriod

**Status:** Accepted

## Context

A stage is not necessarily a single continuous block: a student may work, e.g.,
1 week in October and 2 weeks in November. A single `startDate`/`endDate` pair on
`Stage` cannot represent multiple, non-contiguous periods.

## Decision

Model periods as a separate `StagePeriod` table (1-N from `Stage`), each with
`startDate` and `endDate`. `StagePeriod` is the source of truth for dates.

Validation (BR-04c): at least one period; `endDate >= startDate`; no overlap; all
periods in the same school year (BR-04a); no period ends after 31 August 23:59
(BR-05c).

The front-end presents a dynamic list of period rows ("+ add a period"), each
with two date pickers and a delete button. A richer synthesis calendar is
deferred to V2 (ROADMAP_V2).

## Consequences

- Non-contiguous periods are representable.
- `hoursWorked` per period can be added in V2 on this table (bumps
  `snapshotVersion`, see ADR-0003 / ROADMAP_V2).
- If needed for sorting, `Stage` may expose computed min(start)/max(end), but the
  periods remain authoritative.

## Alternatives considered

- **Single `startDate`/`endDate` on `Stage`.** Rejected: cannot express multiple
  periods, which the domain requires.
