# ADR-0025 — Personnel (ADMIN/REFERENT) accounts: provisioned out-of-band, no institutional email domain

**Status:** Accepted

## Context

Issue #54 (closed) corrected `STUDENT_EMAIL_DOMAIN` and, alongside it, proposed introducing a `STAFF_EMAIL_DOMAIN = "@u-pariscite.fr"` value-object — unplugged, but explicitly there "so that when personnel account creation is eventually built, it doesn't have to rediscover or re-litigate this value" (issue #54, user story #5). That framing implicitly commits a future `ADMIN`/`REFERENT` account-creation flow to validating against an institutional domain, the same way student signup does today.

That premise no longer holds. `ADMIN` accounts are provisioned by hand, directly against the production database, by an operator — not through a signup form — and the email used for a given admin account may not be a `u-pariscite.fr` address at all. No `ADMIN`/`REFERENT` account-creation flow exists in the codebase today: `AuthService.signup()` hardcodes `roles: ["STUDENT"]` (`apps/api/src/modules/auth/auth.service.ts`), and the `referents` module has no controller yet — `docs/userFlow.md`'s "admin: add referents" capability is unbuilt. Login itself (`loginSchema`) already has no domain restriction, so a manually-provisioned personnel account works with the existing login form as-is, regardless of its email's domain.

## Decision

**`ADMIN`/`REFERENT` accounts are not validated against any institutional email domain.** No `STAFF_EMAIL_DOMAIN` constant is introduced in `packages/shared`. Personnel accounts are provisioned out-of-band by an operator (not through this repository's tooling), and their email address is whatever the operator assigns — it does not need to match `u-pariscite.fr` or any other fixed domain.

This is deliberately **provisional, not a closed decision**: it reflects that no real personnel account-creation flow is designed yet, not a permanent claim that one never will validate a domain. When a real "create referent" / "create admin" flow is eventually specified, whether it enforces an institutional domain is a question to raise fresh at that time — this ADR should not be read as having pre-decided it.

## Consequences

- `packages/shared` carries only `STUDENT_EMAIL_DOMAIN` — no parallel staff/personnel domain constant exists to keep in sync or drift.
- A future reader diffing #54 against #55 will see `STAFF_EMAIL_DOMAIN` proposed and then dropped; this ADR is that explanation, so it doesn't read as an unexplained reversal.
- Nobody should "restore" `STAFF_EMAIL_DOMAIN` or add domain validation to a future personnel account-creation flow on the assumption that it was always the plan — that question is open, not settled, and should be raised explicitly when that flow is actually specified.
- No production seeder or provisioning tool for personnel accounts is part of this repository; how an operator actually creates an `ADMIN` row is outside this codebase's scope.

## Alternatives considered

- **Introduce `STAFF_EMAIL_DOMAIN` unplugged, as issue #54 proposed.** Rejected: it documents a domain (`u-pariscite.fr`) as if it were a real constraint personnel accounts will eventually be held to, when in practice the first personnel accounts are manually assigned emails that may not match it at all. Keeping the constant around would be actively misleading to a future implementer.
- **Validate personnel signup against a domain once that flow is built, decided now.** Rejected: no such flow is designed yet, and pre-committing to a domain constraint for a flow that doesn't exist is exactly the kind of premature decision this ADR is undoing from issue #54.
