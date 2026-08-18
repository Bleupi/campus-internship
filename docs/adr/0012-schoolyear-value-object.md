# ADR-0012 — `schoolYear` as a shared Zod value-object + DB `CHECK` (defense-in-depth)

- Status: Accepted
- Deciders: dev
- Related: BR-01, ADR-0009, ADR-0010

## Context

`schoolYear` is a `String` following the convention `"YYYY-YYYY"` (e.g. `"2024-2025"`) and appears on three models: `Stage.schoolYear`, `ReferentAssignment.schoolYear`, and `StudentProfile.profileYear`. The convention was documented but not enforced, risking divergence between the three fields and malformed values.

## Decision

Validate `schoolYear` in **two layers**:

1. **Application layer (source of truth): a shared Zod value-object** in `packages/shared`, enforcing:
   - format `^\d{4}-\d{4}$`
   - semantic rule: second year = first year + 1
   - normalization (trim, canonical form)

   The **same value-object** governs `Stage.schoolYear`, `ReferentAssignment.schoolYear`, and `StudentProfile.profileYear`, preventing divergence.

2. **Database layer (defense-in-depth): a raw-SQL `CHECK` on the format**, added in a Prisma migration:

   ```sql
   ALTER TABLE "Stage" ADD CONSTRAINT stage_school_year_format
     CHECK ("schoolYear" ~ '^\d{4}-\d{4}$');
   -- analogous constraints on ReferentAssignment.schoolYear
   -- and StudentProfile.profileYear
   ```

   The N+1 semantic rule stays in Zod only — it is not reasonably expressible as a simple CHECK.

## Consequences

- Malformed values are rejected both by the API and, as a last resort, by the database.
- The N+1 rule has a single home (Zod), avoiding duplicated, drifting logic.
- Demonstrates multi-layer validation intentionally, a positive signal in review.
- CHECK constraints are authored in raw SQL inside Prisma migrations, since Prisma's DSL does not model CHECK natively.
