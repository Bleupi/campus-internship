# ADR-0031 — Referent accounts can be created from the admin UI

- Status: Accepted
- Date: 2026-09-21
- Deciders: project owner
- Supersedes (in part): ADR-0025 — only its premise that "no `ADMIN`/`REFERENT` account-creation flow exists"; ADMIN accounts stay provisioned out-of-band and the no-institutional-domain rule stands
- Related: ADR-0001 (central `User`, multiple roles), ADR-0014 (referent assignment key), BR-03, BR-13

## Context

Assigning a referent is mandatory before an admin can validate or refuse a stage (BR-03). Referent assignments reset every school year and semester, but the _referents themselves_ do not — yet at the start of a year the admin regularly meets a stage whose referent does not exist in the system at all. ADR-0025 made personnel accounts an out-of-band operator task, which would block the admin's flow every time.

`ReferentProfile.userId` is mandatory and `firstName`/`lastName` live on `User` only (single source of truth, `dataModel.md`), so "a referent" cannot be a bare name/email record. `User.passwordHash` is non-nullable.

## Decision

An admin can create a referent on the fly from the assignment picker: `POST /admin/referents { firstName, lastName, email }` creates a `User` (roles `["REFERENT"]`) and its `ReferentProfile`.

- The account is created with a random, never-disclosed password hash: it cannot be logged into. It is activated, if it ever needs to be, through the existing forgot-password flow (BR-13, which works for any role) — no invitation flow is built in V1, which has no referent-facing screen.
- `email` is unique on `User`. If it already belongs to a `User` (e.g. an admin who is also a referent, ADR-0001), the `REFERENT` role and a `ReferentProfile` are added to that user; their existing name and password are never modified. The submitted first and last name must match the ones on file (ignoring case and accents); otherwise the request is rejected with a conflict. An email identifies a single person, so it can never be reused under another name.
- Still no institutional-domain validation on `email` (ADR-0025 stands on that point).
- The picker lists every non-archived `ReferentProfile`, not only those with assignments in the current year.

## Consequences

- Requires no schema change: `User` and `ReferentProfile` already carry everything needed.
- The referent's `User.email` must be a real address: it receives the validation email as a visible cc (BR-07).
- Nothing prevents creating two people with the same name; the unique key is the email.
- A referent account that was created but never activated is inert, not a security exposure: no known credential exists.

## Alternatives considered

- **Keep referent creation out-of-band (ADR-0025 as written).** Rejected: the operator would have to be involved each time a stage arrives with a not-yet-known referent, which is the normal case at every rentrée.
- **Create a real account and email an invitation.** Rejected for V1: no referent-facing feature exists yet; the forgot-password flow already covers activation on demand.
- **Store a referent as a name/email record without a `User`.** Rejected: `ReferentProfile.userId` is mandatory and names live on `User`; duplicating them would break the single source of truth.
