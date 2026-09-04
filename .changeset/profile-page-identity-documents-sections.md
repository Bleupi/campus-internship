---
"web": patch
"shared": patch
---

Reorganize the student profile page into two clearly separated sections, "Identité & contact" and "Documents", under a single "Modifier" affordance that switches both sections into edit mode together — replacing the previous flat, undifferentiated layout.

- The document content-checklist and its confirmation checkbox (from the unmerged PR #48 attempt) are ported in and relocated so they render only within the Documents section, and only while editing; the certificate upload/replace control stays disabled until the checkbox is checked.
- The insurance document is referred to as "attestation de responsabilité civile scolaire" everywhere it appears on the page, replacing the abbreviated "attestation d'assurance".
- A note explaining that the personal email is also used for notifications now appears next to that field in both the viewing and editing states.
- The em dash placeholder previously used for an empty field ("—") is replaced with "non renseigné"; no em dash remains anywhere in the page's copy.
- Fixed: a VALID profile with an unset phone or personal email could not be saved at all — an untouched field submitted as `""`, which the schema deliberately rejects (only `null` means "no value"). Empty fields are now normalized to `null` before validation.
- Fixed: `personalEmail`'s validation error was the untranslated Zod default ("Invalid email"); it now reads "Adresse email invalide".
- The phone field now only accepts digits and "+" as the user types; other characters are silently dropped.
- The document content-checklist's copy is trimmed to drop the format examples, keeping only what actually matters (covers the internship and the current school year).
- No change to validation rules beyond the two fixes above, submission behavior, or file upload mechanics.
