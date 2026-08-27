---
"api": patch
"web": patch
"shared": patch
---

Validate the profile's `phone` field as a French mobile number (06/07, national or +33/0033 international, common separators) instead of accepting any non-empty string.

- New shared `frenchMobilePhoneSchema` (`packages/shared/src/schemas/phone.schema.ts`), consumed by `updateProfileSchema` — so `PATCH /students/me/profile` and the profile edit form reject the same malformed values.
- A landline (01-05/08/09), foreign, or malformed number is now rejected (400 on the API, inline form error on the frontend) instead of being silently accepted.
