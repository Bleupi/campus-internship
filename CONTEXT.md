# Campus Internship — Glossary

Domain vocabulary not already captured by `docs/dataModel.md` / `docs/businessRules.md` (the primary glossary per `docs/agents/domain.md`) — terms that are French-facing, content-level, or otherwise don't map onto a schema field. Prefer this file's wording only where it doesn't overlap `dataModel.md`/`businessRules.md`; those two remain authoritative for anything schema- or rule-shaped.

## Language

**Attestation de responsabilité civile (scolaire)**: The document a student uploads as `FileType.INSURANCE_CERTIFICATE` (`docs/dataModel.md`). French name used in UI copy and in what the admin actually reads; the schema/enum name stays English per ADR-0010's language convention. _Avoid_: certificat d'assurance (used loosely in `userFlow.md`/ADR-0004 prose, but the precise document name a student's insurer issues is "attestation de responsabilité civile").

**Stage conventionné**: Not a `Stage` subtype — every `Stage` in this system is conventionné (arranged under a university internship agreement). The phrase matters only as content the admin must find _inside_ the uploaded attestation: a valid attestation's coverage text must extend to internships specifically (not just generic civil liability), for the current school year. Verifying this is a manual, visual part of the admin's certificate-validation judgment — not a schema field, not an automated check.

Insurers phrase internship coverage inconsistently; from project archives, all of the following have been seen and should be treated as equivalent when reviewing: "un stage de formation", "stages conventionnés", "les stages nécessités par la scolarité", "stage en entreprise". No canonical wording is enforced on the student — content, not phrasing, is what's checked.

**Couverture de la période scolaire (attestation)**: The part of the attestation's coverage text that must overlap the current school year — distinct from the `schoolYear` value object (ADR-0012, a normalized `"YYYY-YYYY"` string used internally), which is never what the document itself says. Insurers phrase this inconsistently too; seen in archives: "vie scolaire", "activités scolaires et extrascolaires", "au cours de ses études", "activités scolaires obligatoires et facultatives", "les cours dispensés au sein de l'établissement scolaire", "enseignement supérieur".
