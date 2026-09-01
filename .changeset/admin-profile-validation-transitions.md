---
"api": minor
"shared": minor
---

Add the two admin-triggered `ProfileStatus` transitions (issue #13): `PATCH /admin/students/:id/profile/validate` (`PENDING_VALIDATION → VALID`) and `.../reject` (`PENDING_VALIDATION`/`VALID → INCOMPLETE`, reason required). Backend-only, no admin queue UI yet (fogged on the wayfinder map, issue #4) — this ticket exists so the state machine (ADR-0004) has a real, testable path to `VALID` for BR-02.

- `packages/shared`: `rejectProfileSchema` (non-empty, trimmed `reason`) and a new `admin.contract.ts` (`RejectProfileRequest`, `AdminProfileTransitionResponse`).
- `apps/api`: a new `AdminModule` controller/service pair, `ADMIN`-only via `RolesGuard`. Both transitions are enforced atomically via a status-conditioned `updateMany` (not a separate read-then-write) so two concurrent admin actions on the same profile can't race to a silent last-write-wins — the losing call correctly gets a 409. An invalid source status is rejected with 409; an unknown student id with 404. BR-07's student notification is a `Logger` stub — no mailer/notification subsystem exists yet in this codebase, and building one is out of this ticket's scope.
