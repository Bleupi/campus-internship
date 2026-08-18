# ADR-0004 — Student profile state machine

**Status:** Accepted

## Context

The insurance certificate expires yearly and must be checked by the admin before a student can submit stage requests. A single boolean ("valid or not") cannot express the intermediate state where the student has provided everything but the admin has not yet verified the certificate. Students must still be able to work on drafts during that time.

## Decision

Model the student profile with an explicit **state machine** via `ProfileStatus`:

- `INCOMPLETE` — missing fields or files
- `PENDING_VALIDATION` — everything provided (certificate included), awaiting admin verification
- `VALID` — certificate verified by admin, up to date for the current year
- `EXPIRED` — school year rolled over or certificate expired (lazy-computed at login)

Rules:

- Drafts can be created at any status.
- **Submission requires `VALID`** (BR-02).
- Admin action "validate certificate" moves `PENDING_VALIDATION → VALID`; "reject" moves it back to `INCOMPLETE` with a reason.

Because a stage cannot be validated unless the student is `VALID`, validating certificates is the **first admin action** — hence a dedicated "certificates to validate" queue in V1.

## Consequences

- Clear separation between "student did their part" and "admin verified it".
- Introduces a second admin work queue (certificates) alongside stages.
- Lazy evaluation at login drives `EXPIRED` transitions (BR-06), avoiding scheduled jobs.

## Alternatives considered

- **Boolean `isValid`.** Rejected: cannot represent the pending-verification state, which the workflow requires.
