---
"web": minor
---

Add content guidance and a confirmation checkbox to the attestation upload step on the profile screen (issue #45), so students see what a valid document must cover before submitting one that would just get rejected by the admin.

- Relabel "certificat d'assurance" → "attestation de responsabilité civile scolaire" everywhere in the profile UI, matching `CONTEXT.md`'s canonical term.
- Show a checklist above the upload describing the required content (coverage of internships and the current school year), not a format/template.
- Gate the upload behind a required, client-side-only, unpersisted confirmation checkbox — a nudge, not a verifiable guarantee. No new schema/field, no API payload change.
