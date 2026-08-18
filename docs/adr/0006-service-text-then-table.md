# ADR-0006 — Service as text in V1, OrganismService in V2

**Status:** Accepted

## Context

A stage happens in a specific service within a host organism. The admin wants to see which services within an organism host students. That information is really a property of a given stage (where the student is placed), and "which services host students" can be derived from the stages themselves. There is currently no service-specific data (own address, internal referent, etc.).

## Decision

In **V1**, `service` is a **text field on `Stage`**. The organism has no service list; the set of active services is derived from its stages.

In **V2**, introduce an `OrganismService` table to make services first-class and **link tutors to the services of a single organism**. See ROADMAP_V2.

## Consequences

- V1 stays simple and matches the actual need ("which services host students").
- No premature normalization of an entity that has no attributes yet.
- The V2 migration is **non-destructive**:
  1. add `OrganismService`;
  2. add nullable `serviceId` on `Stage` and `Tutor`;
  3. backfill by de-duplicating textual services per organism;
  4. keep the text column during transition, drop later.
- Watch-out: inconsistent textual spellings create duplicates at backfill time — normalize in the script. Low risk.

## Alternatives considered

- **`String[]` of services on the organism.** Rejected: duplicates information that lives better in the stages, and is hard to reconcile with "which services actually host students".
- **`OrganismService` table now.** Rejected for V1: adds create/de-dup handling with no current value (no service-specific attributes yet).
