---
"api": minor
"web": minor
"shared": minor
---

Create and save a stage draft via the "Nouvelle demande" wizard (issue #113, BR-04b, BR-04c, BR-05a-c).

- Introduces `FEATURE_STAGE_MANAGEMENT`/`VITE_FEATURE_STAGE_MANAGEMENT` (ADR-0029): off by default, `StagesModule`/`OrganismsModule` are never registered in `app.module.ts` so their routes true-404 rather than 401/403, and the frontend registers no `/stages/*` route or nav entry.
- With the flag on, a student can search an existing `HostOrganism` case- and accent-insensitively (`ILIKE` + `unaccent`, new migration enabling the Postgres extension), or create one inline with a tutor, without leaving the wizard.
- The wizard supports multiple work periods with a live client-side semester-derivation preview (`deriveSemester`, `stagePeriodsSchema` — new in `packages/shared`), requires an explicit `mandatory` choice (no silent default), and saves everything as a `DRAFT` `Stage` + `StagePeriod`s + the resolved organism/tutor in one Prisma transaction — a mid-wizard failure (e.g. a tutor that doesn't belong to the resolved organism) leaves no orphaned `HostOrganism`/`Tutor` row.
- `schoolYear`/`semester` are always derived server-side from the submitted periods; `createStageDraftSchema` has no `semester` field at all, so a client-supplied value is never even parsed, let alone persisted (BR-04b).
- Seeds the fixed `OrganismStructureType` label list used by the inline-organism-creation dropdown.
- The inline "create a new organism" option in the search dropdown reads "Créer une nouvelle structure" and is visually set apart (icon, bold, accent color) from real search results.
