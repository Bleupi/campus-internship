---
"api": patch
"web": patch
"shared": patch
---

Change the accepted student email domain from `@u-paris.fr` to `@u-pariscite.fr`.

- `packages/shared`: `STUDENT_EMAIL_DOMAIN` (in `university-email.schema.ts`) now reads `@u-pariscite.fr`, updating both `signupSchema` (the domain a login email must end with) and `updateProfileSchema` (the domain `personalEmail` must not end with).
- No code changes on either side beyond the constant — `apps/api`'s `ZodValidationPipe` and `apps/web`'s `zodResolver` pick it up automatically since both consume the shared schema.
