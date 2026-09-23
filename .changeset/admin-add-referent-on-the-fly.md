---
"api": minor
"web": minor
"shared": minor
---

Add a referent on the fly from the "Demandes à traiter" picker (issue #150, part of #144, ADR-0031). `POST /admin/referents { firstName, lastName, email }` creates a `User` with the `REFERENT` role, a `ReferentProfile` and a random, never-disclosed password hash (activation, if ever needed, goes through forgot-password, BR-13). If the email already belongs to a user (looked up case-insensitively), that user gets the role and profile added instead — their name and password are left untouched and no second account is created. The email identifies one person: submitting an existing email under a different first or last name (compared ignoring case and accents) is rejected with a 409, which the form shows as a specific error. No institutional-domain check on the email. `ADMIN`-only, and absent when `FEATURE_STAGE_MANAGEMENT` is off (ADR-0029).

- `packages/shared`: `createReferentSchema` (trimmed first/last name and email), `CreateReferentRequest`/`CreateReferentResponse`.
- `apps/api`: `AdminReferentsController` and `ReferentsService.create` in the referents module.
- `apps/web`: the referent picker ends with a "+ Ajouter un référent…" option opening an `AddReferentDialog` (react-hook-form against the shared schema); on success the new referent is assigned to the request through the same single-assignment path as a regular pick. A failed assignment, from the picker or right after creating a referent, now shows an error on the page instead of failing silently (a gap since #148).
