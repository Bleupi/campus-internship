---
"api": patch
"web": patch
"shared": patch
---

Correct the student institutional email domain.

`STUDENT_EMAIL_DOMAIN` (`packages/shared`) is corrected from `@u-pariscite.fr` back to the real student domain, `@etu.u-paris.fr`. This is a correction, not a fresh design decision: PR #51 mistakenly applied a domain change communicated for **university personnel** to the **student** constant instead. Personnel (`ADMIN`/`REFERENT`) accounts are provisioned out-of-band and have no institutional email domain constraint — see ADR-0025.

- `packages/shared`: `STUDENT_EMAIL_DOMAIN` now reads `@etu.u-paris.fr`.
- No code changes beyond the constant — `signupSchema` and `updateProfileSchema` (and therefore `apps/api`'s `ZodValidationPipe` and `apps/web`'s `zodResolver`) pick up the corrected value automatically.
- `docs/dataModel.md` field comments corrected to describe the real student domain.
- A Prisma data migration corrects existing `User` rows created under the wrong domain (additive `UPDATE`, never a reset) — prepared and committed, but not executed against production by the agent.
