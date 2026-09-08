---
"api": minor
---

Send a real email on `StudentProfile` validation/refusal (issue #67, BR-11), replacing the `Logger`-only stub from issue #13. A new `MailerService` (`apps/api/src/modules/mailer/`) posts to Scaleway Transactional Email (ADR-0026) via `fetch` — no new npm dependency. Recipients: the student's institutional address always, cc'd to their personal address (`StudentProfile.personalEmail`) when one is on file; a refusal email's body includes the admin's reason. A failed send is caught and logged (`Logger.error`), never propagated — by the time it runs, the profile's status transition has already committed, so a mail hiccup doesn't turn an already-successful admin action into a 500. `MailerService` is DI-swappable/mockable — no test depends on a real Scaleway call succeeding.

New required env vars (`.env.example`): `MAILER_SCW_SECRET_KEY`, `MAILER_SCW_PROJECT_ID`, `MAILER_FROM_EMAIL`, `MAILER_FROM_NAME`. Account/domain/credential provisioning is tracked out-of-band, outside this ticket.

Both email bodies now name the acting admin (`"NOM Prénom, responsable de stages L2 et L3 APA-S"`) instead of "l'administration", read off the authenticated JWT caller of `validate`/`reject` rather than accepted as client input; each signature repeats `"NOM Prénom"` alone. The refusal email's subject changed from "Votre profil a été rejeté" to "Votre profil a été refusé". The admin's function/title is a single hardcoded constant for now (one admin in V1) — tracked in `docs/ROADMAP_V2.md`.
