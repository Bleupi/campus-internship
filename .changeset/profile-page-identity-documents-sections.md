---
"web": patch
---

Reorganize the student profile page into two clearly separated sections, "Mes informations" (identity/contact) and "Documents", under the page's single existing "Modifier" affordance — replacing the previous flat, undifferentiated layout.

- The document content-checklist and its confirmation checkbox (from the unmerged PR #48 attempt) are ported in and relocated so they render only within the Documents section; the certificate upload/replace control stays disabled until the checkbox is checked.
- The insurance document is referred to as "attestation de responsabilité civile scolaire" everywhere it appears on the page, replacing the abbreviated "attestation d'assurance".
- A note explaining that the personal email is also used for notifications now appears next to that field in both the viewing and editing states.
- The em dash placeholder previously used for an empty field ("—") is replaced with "non renseigné"; no em dash remains anywhere in the page's copy.
- No change to validation rules, submission behavior, or file upload mechanics.
