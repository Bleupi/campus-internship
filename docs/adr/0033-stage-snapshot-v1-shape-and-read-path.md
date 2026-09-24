# ADR-0033 — Stage snapshot v1: its shape and read path

- Status: Accepted
- Date: 2026-09-21
- Deciders: project owner
- Related: ADR-0003 (stage snapshot), ADR-0032 (derived freeze), BR-03, BR-08

## Context

ADR-0003 decided that a `VALIDATED`/`REFUSED` stage is displayed from an immutable, Zod-validated, versioned `snapshot`, and that the backend has a single read path returning the same DTO shape whatever the status. It left the snapshot's actual shape, and what a reader does with a snapshot it cannot read, open. Until now nothing wrote or read one: the detail endpoint answered 501 for a decided stage (issue #114), which made the duplicate action (issue #117) unreachable from a decided stage's detail page.

## Decision

**Snapshot version 1 is the content of the stage detail response**, so that the read path can return it as is (ADR-0003: "already the right shape"): `schoolYear`, `semester`, `mandatory`, `service`, `projectType`, `motivation`, `organism`, `tutor`, `periods` and `referent`. `referent` is required and never null (BR-03).

It also freezes what only exists at decision time, as `docs/dataModel.md` prescribes:

- `decidedAt`: when the admin validated or refused. "Decided" is the one word for both outcomes, the status says which; it matches the `Stage.decidedAt` column the data model already lists (added here by an additive migration, and written alongside the snapshot by the validate/refuse writer, to sort and paginate the admin history without opening JSON).
- `decidedBy`: the acting admin (`id`, `firstName`, `lastName`) and their `title`, the function they held then. BR-11 hardcodes that title today and will make it a real field, so a decided stage keeps the one it was decided under.
- `promotion`: the student's promotion at that time, to label past stages ("L2 · S1").

What stays a live column of the row is not duplicated into the snapshot: `id`, `status`, `version`, `submittedAt`, `refusalReason`. The per-row `editable` flags are not stored either; a decided stage always answers `false`. The student's response is built field by field from the snapshot: it carries `decidedAt` but never `decidedBy` or `promotion`.

**One Zod schema per snapshot version, in `apps/api`**, dispatched on `snapshotVersion` by `parseStageSnapshot`. A new version adds a schema and a `case`; an existing schema is never edited. It stays in `apps/api` and not in `packages/shared` because only the API writes and reads it (CLAUDE.md §7); the web consumes the detail response. Unknown keys are dropped on parse, so a writer can add fields without breaking older readers.

**The list follows the same rule per row.** `GET /stages` reads a live stage's organism, school year, semester, kind and periods from the live rows and a decided stage's from its snapshot, so the web only displays what it is given. Unlike the detail, an unreadable snapshot there does not fail the request: the row is listed with a null organism name and no periods, and the error is logged, so one corrupt stage cannot blank the student's whole list. The live rows are still not a fallback.

**A decided stage whose snapshot is missing, of an unknown version, or unparseable is a 500**, logged with the stage id. The reader never falls back to the live relations: showing data edited after the decision is exactly what BR-08 forbids, and an error is the honest signal that a legal document is corrupt.

## Consequences

- Issue #151 is the first writer: it produces snapshot v1 through `parseStageSnapshot(candidate, CURRENT_STAGE_SNAPSHOT_VERSION)` for refusal, so a write that would not read back fails at write time. Validation (a later ticket) writes the same shape.
- The detail page and the duplicate action can work for every status once the student-side read path (deferred — see "After #151" in PR #159) is built against this shape.
- A stage decided before any writer exists cannot be read: there were none, since nothing had set those statuses.
- The detail page shows the decision date of a decided stage, once that read path exists.

## Alternatives considered

- **A snapshot shaped like the database rows.** Rejected: every read would need a second mapping into the DTO, and ADR-0003 asks for the read path to return the snapshot directly.
- **Falling back to the live relations when the snapshot is missing.** Rejected: silently violates BR-08 on exactly the rows where something already went wrong.
- **Storing `decidedAt` only in the column, or only in the snapshot.** Rejected: the column is what the history sorts by, the snapshot is the frozen document. Both are written in the same transaction by the same writer.
- **Defining the schema in `packages/shared`.** Rejected for now: no code on the web side parses it; move it if that changes.
