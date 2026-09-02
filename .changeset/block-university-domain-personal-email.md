---
"api": patch
"web": patch
"shared": patch
---

Reject a `@u-paris.fr` address in `personalEmail` on profile update. A student's personal email is meant to be a non-institutional contact address, distinct from their immutable `u-paris.fr` login email — nothing previously stopped them from re-entering the same institutional domain there.

- `packages/shared`: extracted `STUDENT_EMAIL_DOMAIN` out of `signup.schema.ts` into a neutral `university-email.schema.ts` (it's no longer signup-only) and added a case-insensitive `.refine()` on `updateProfileSchema.personalEmail` rejecting that domain, with a French error message.
- Enforced on both sides via the shared schema: `apps/api`'s `ZodValidationPipe` and `apps/web`'s `zodResolver(updateProfileSchema)` on the profile form — no new code needed on either side beyond the schema change.
