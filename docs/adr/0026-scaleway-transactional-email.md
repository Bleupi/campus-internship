# ADR-0026 — Email provider: Scaleway Transactional Email

**Status:** Accepted

## Context

Issue #67 (part of PRD spec #63/#64) replaces the internal-log-only stub that fires when an admin validates or refuses a `StudentProfile` with a real email to the student. This is the project's first real email-sending dependency — no mailer/notification infrastructure exists in the codebase before this (`AdminStudentsService.notifyStudent()` was a `Logger`-only stub, scoped that way deliberately by issue #13).

Requirements fixed by spec #63/#64, which this ADR has to satisfy:

- Low volume: an estimated ~100-150 refusal emails/year for this feature alone, plus validation emails — comfortably inside a free/entry tier.
- EU data residency, to avoid an international-data-transfer analysis a non-EU processor would otherwise require.
- No marketing-style unsubscribe/consent flow needed — this is a transactional/service message (account status), not commercial prospecting.
- Recipients: To = the student's institutional address (`User.email`), Cc = `StudentProfile.personalEmail` when present.
- No delivery-failure handling built into the application — the provider's own delivery/activity dashboard is the fallback for diagnosing a failed send.

## Decision

Use **Scaleway Transactional Email (TEM)**, Essential (pay-as-you-go) plan, called directly over its REST API via a small `MailerService` (`apps/api/src/modules/mailer/mailer.service.ts`) — no SDK dependency, just `fetch` (Node 24's global `fetch`, already available without adding a package).

```ts
POST https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails
Headers: X-Auth-Token: <SCW secret key>
Body: { project_id, from: {email, name}, to: [...], cc: [...], subject, text }
```

`MailerModule` exports `MailerService`; `AdminModule` is its only consumer today. `MailerService.send(input)` is the entire interface — composing and sending one email. Deciding _when_ to notify a student stays in `AdminStudentsService`, which now also catches and logs a failed send (`Logger.error`) rather than letting it fail the whole validate/reject request — by the time `notifyStudent()` runs, the `StudentProfile.profileStatus` transition has already committed, so a mail hiccup shouldn't turn an already-successful admin action into a 500.

Configuration (`apps/api/src/config/env.schema.ts`, `.env.example`): `MAILER_SCW_SECRET_KEY`, `MAILER_SCW_PROJECT_ID`, `MAILER_FROM_EMAIL`, `MAILER_FROM_NAME`. The region is hardcoded to `fr-par` (Scaleway TEM's only region at the time of writing) rather than exposed as a var — there's exactly one real choice, so making it configurable would be speculative.

**Account/domain/credential provisioning is out of scope for this ADR and this ticket** — tracked separately, out-of-band, the same way ADR-0025 treats personnel-account provisioning. `.env.example` carries the var names with blank/placeholder values; nothing in the test suite depends on a real Scaleway call succeeding (`MailerService` is DI-overridden with a stub in every e2e spec that reaches a validate/reject transition; unit tests mock it directly, the same way `FilesService` is already mocked).

## Consequences

- No new npm dependency — Scaleway TEM's API is small enough that a raw `fetch` call is simpler and lighter than pulling in a vendor SDK, unlike the S3 case (ADR-0020) where the API surface justified `@aws-sdk/client-s3`.
- `MailerService` stays a thin, single-method wrapper — the same shape `FilesService` had before it grew a second method; more methods (e.g. templated HTML bodies) are added only when a real need shows up.
- Swapping providers later means rewriting `MailerService`'s internals only — `AdminStudentsService` (and any future caller) depends on `send(input)`, never on Scaleway's request/response shape directly.
- No delivery-failure alerting or in-app activity log exists — Scaleway TEM's own "Email activity" console view is the only place to diagnose a failed send in V1 (`docs/ROADMAP_V2.md` § Proactive email delivery failure alerting covers the deferred alternative).
- Until the real account/domain/credentials are provisioned (tracked out-of-band), no email actually leaves the system in any environment — `MAILER_FROM_EMAIL` is a placeholder in `.env.example`, and production deployment (ADR-0022) needs the real values injected the same way `JWT_SECRET` and the S3 credentials already are.

## Alternatives considered

- **Resend.** Rejected specifically for GDPR simplicity: Resend is a US-based processor, which would require an international-transfer analysis (SCCs, EU-US DPF) this project doesn't need to take on. Scaleway keeps data and processing in France/EU.
- **A generic `NotificationsModule` covering future consumers (stage management, forgot-password) too.** Rejected as premature: neither of those consumers exists in the codebase yet (stage management is unbuilt, forgot-password is unspecified). `MailerService` is deliberately minimal and single-purpose; a shared abstraction gets extracted once a second real consumer actually arrives, not before (same YAGNI spirit as ADR-0002 and ADR-0006).
- **A vendor SDK (`scaleway-sdk` or similar) instead of raw `fetch`.** Rejected: the TEM API surface used here is one POST endpoint — a full SDK would add a dependency for a single call site, disproportionate to the actual integration surface.
