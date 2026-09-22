---
"api": patch
"web": patch
---

Fix the "Demandes à traiter" row-expand detail showing a hollow "Non renseigné" phone line next to "Accepte d'être contacté par téléphone" whenever a tutor had `acceptsPhoneContact: true` with no phone on file — `showPhoneContact` incorrectly OR'd the two independent fields instead of hiding the section on a null phone alone. Also, from the same `/code-review` pass: `admin-stage-requests.service.ts`'s BR-02-completeness guards now throw a shaped `InternalServerErrorException` instead of a raw `Error` (CLAUDE.md §5), `getById()` scopes its organism/tutor fetch with `select` and wraps its stage + referent-assignment reads in one transaction (matching `list()`'s existing pattern), and the near-duplicate e2e fixture helpers across both describe blocks in `admin-stage-requests.e2e-spec.ts` were hoisted into one shared factory.
