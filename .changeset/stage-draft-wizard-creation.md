---
"api": minor
"web": minor
"shared": minor
---

Create and save a stage draft via the "Nouvelle demande" wizard (issue #113, BR-04b, BR-04c, BR-05a-c).

- Introduces `FEATURE_STAGE_MANAGEMENT`/`VITE_FEATURE_STAGE_MANAGEMENT` (ADR-0029): off by default, `StagesModule`/`OrganismsModule` are never registered in `app.module.ts` so their routes true-404 rather than 401/403, and the frontend registers no `/stages/*` route and shows no "Nouvelle demande" entry point.
- With the flag on, a student can search an existing `HostOrganism` case- and accent-insensitively (`ILIKE` + `unaccent`, new migration enabling the Postgres extension), or create one inline with a tutor, without leaving the wizard.
- The wizard supports multiple work periods with a live client-side semester-derivation preview (`deriveSemester`, `stagePeriodsSchema` — new in `packages/shared`), requires an explicit `mandatory` choice (no silent default), and saves everything as a `DRAFT` `Stage` + `StagePeriod`s + the resolved organism/tutor in one Prisma transaction — a mid-wizard failure (e.g. a tutor that doesn't belong to the resolved organism) leaves no orphaned `HostOrganism`/`Tutor` row.
- `schoolYear`/`semester` are always derived server-side from the submitted periods; `createStageDraftSchema` has no `semester` field at all, so a client-supplied value is never even parsed, let alone persisted (BR-04b).
- Seeds the fixed `OrganismStructureType` label list used by the inline-organism-creation dropdown.
- "Créer un nouvel Organisme"/"Créer un nouveau Tuteur" are standalone outlined buttons below the organism search and tutor pickers (not options inside the dropdowns); the inline tutor-creation form also exposes the "Accepte d'être contacté par téléphone" switch (`acceptsPhoneContact`).
- The périodes step shows the derived-semester preview inline next to the "Périodes de stage" label instead of a separate BR-04b-referencing sentence; the détails step no longer labels `service`/`projectType`/`motivation` as "(facultatif)" since they're only optional at draft time, not at submission, and asks "Ce stage est-il obligatoire ?" with a plain Oui/Non choice.
- The récapitulatif step shows every field captured in the previous steps (organism address, tutor contact details, all periods, service/handicap type/motivation, and the mandatory choice), not just a subset.
- The "Nouvelle demande" entry point is a button on the tableau de bord (student-only, flag-gated), no longer a menu item.
- A shared `PhoneField` (digits and `+` only, phone keypad on mobile) is used by both the student profile and the inline tutor-creation form.
- The périodes alerts sit above the list of periods; on phones the period rows wrap and the wizard shows a compact "Étape N sur 4" progress bar instead of the four-label stepper, so the page no longer scrolls horizontally.
- The récapitulatif is split into titled cards with a muted label above each value, lists "Stage obligatoire" before the (possibly long) motivation, and no longer flags the organism/tutor as new.
