---
"api": patch
"web": patch
"shared": patch
---

Correct the student institutional email domain and add the (unplugged) staff one.

`STUDENT_EMAIL_DOMAIN` (`packages/shared`) is corrected from `@u-pariscite.fr` back to the real student domain, `@etu.u-paris.fr`. This is a correction, not a fresh design decision: PR #51 mistakenly applied a domain change communicated for **university personnel** to the **student** constant instead. `@u-pariscite.fr` is now defined separately as `STAFF_EMAIL_DOMAIN`, correctly scoped to `ADMIN`/`REFERENT`, but left unplugged — no personnel signup/creation flow exists yet to consume it.

- `packages/shared`: `STUDENT_EMAIL_DOMAIN` now reads `@etu.u-paris.fr`; new `STAFF_EMAIL_DOMAIN` (`@u-pariscite.fr`) added, not yet consumed by any schema.
- No code changes beyond the constants — `signupSchema` and `updateProfileSchema` (and therefore `apps/api`'s `ZodValidationPipe` and `apps/web`'s `zodResolver`) pick up the corrected value automatically.
- `docs/dataModel.md` field comments corrected to describe the real domain split.
- A Prisma data migration corrects existing `User` rows created under the wrong domain (additive `UPDATE`, never a reset) — prepared and committed, but not executed against production by the agent.
