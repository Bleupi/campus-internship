---
"web": patch
"shared": patch
---

Reorganize the student profile page into two clearly separated sections, "Identité & contact" and "Documents", rendered as MUI card blocks per the approved design, under a single "Modifier" affordance that switches both sections into edit mode together — replacing the previous flat, undifferentiated layout.

- The document content-checklist, the attestation upload row, and its confirmation checkbox (from the unmerged PR #48 attempt) are ported in and relocated so they render only within the Documents section, and only while editing, in that order. The checkbox no longer gates the ability to upload a new certificate — uploading is always available — but saving the rest of the form is blocked (with an explanatory message) until the checkbox is (re-)checked for a certificate uploaded during that same edit session.
- The insurance document is referred to as "attestation de responsabilité civile scolaire" everywhere it appears on the page, replacing the abbreviated "attestation d'assurance".
- A note explaining that the personal email is also used for notifications now appears next to that field in both the viewing and editing states.
- The em dash placeholder previously used for an empty field ("—") is replaced with a shared "non renseigné" constant; no em dash remains anywhere in the page's copy.
- Fixed: clicking "Modifier" on a VALID/PENDING_VALIDATION profile silently did nothing — React reused the same DOM button element for "Enregistrer" (same position, no `key`), flipping its `type` from `button` to `submit` while the click was still being processed, so it fired as a real form submission and bounced straight back to read mode. Distinct `key`s now force React to mount a new element instead of mutating the existing one in place.
- Fixed: an INCOMPLETE/EXPIRED profile's forced-edit form failed to save when phone/personalEmail were left untouched-and-empty — react-hook-form's `setValueAs` only applies to fields the user actually typed into, so an untouched empty field reached the schema as `""` (deliberately rejected) instead of `null`. Empty values are now normalized in a resolver wrapper instead, independent of whether the field was touched.
- Fixed: `personalEmail`'s validation error was the untranslated Zod default ("Invalid email"); it now reads "Adresse email invalide".
- The phone field now only accepts digits and "+" as the user types; other characters are silently dropped.
- The document content-checklist's copy is trimmed to drop the format examples, keeping only what actually matters (covers the internship and the current school year).
- No change to validation rules beyond the fixes above, submission behavior, or file upload mechanics.
