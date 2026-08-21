# CLAUDE.md

Instructions for Claude Code when working in this repository. Written in English for consistency with `docs/` and `docs/adr/` (code, schema, and project documentation are in English; only UI copy is in French — see ADR-0010).

This file is subordinate to the specs. If anything here conflicts with `docs/dataModel.md`, `docs/businessRules.md`, `docs/userFlow.md`, or an ADR, **the doc wins** — flag the conflict and ask rather than silently picking one.

## 1. Project identity

A showcase project for a university internship management system (campus internship / "gestion des stages"). Students submit internship requests; one or two admins validate/refuse them and manage referents assigned to students; the admin can extract data (host organism list, CSV export).

- **Stack**: NestJS (API) + React/Vite (web) + PostgreSQL + Prisma + Zod, TypeScript everywhere.
- **Layout**: pnpm workspaces monorepo — `apps/api`, `apps/web`, `packages/shared` (ADR-0010). No Turborepo for now.
- **Audience**: this is an interview/portfolio piece. Code quality, idiomatic use of each technology, and a documented rationale for every structuring decision (ADRs) matter as much as working features.
- **Language convention**: code, schema, comments, commit messages, and this file → English. UI copy shown to users → French.

---

## 2. Read this before touching domain logic

In this order, every time a task touches business behavior:

1. `docs/dataModel.md` — schema, single source of truth for entities.
2. `docs/businessRules.md` — numbered rules (`BR-xx`), each maps to a testable unit.
3. `docs/userFlow.md` — behavior from the user's point of view.
4. `docs/adr/` — the _why_ behind structuring decisions. Read the ones relevant to what you're touching before proposing a design that might re-litigate them.
5. `CONTRIBUTING.md` — commit format, versioning/changeset workflow, and the PR loop. Read before generating a commit message or opening a PR.

`docs/ROADMAP_V2.md` is explicitly **out of scope** — ideas parked there (period calendar visualization, `hoursWorked`, `AdminProfile`, presigned uploads, `OrganismService`) must never be implemented unless the user asks for the V2 milestone by name.

---

## 3. Non-negotiable business invariants

These are load-bearing. Do not "simplify" or "optimize" them away, even if a simpler-looking implementation suggests itself.

- **`Stage.semester` is derived, never entered.** Computed from the stage's periods on every write that touches them; a straddling stage resolves to `S1`. Any client-supplied `semester` is ignored, not validated-and-used. (BR-04b)
- **The referent is not a FK on `Stage`.** While `DRAFT`/`PENDING`, it's derived on the fly from `ReferentAssignment` (by student + schoolYear + semester + `mandatory`). It is frozen into `Stage.snapshot` only at validation/refusal. Never add a `referentId` column to `Stage`. (ADR-0003, BR-03, BR-08)
- **`ReferentAssignment` is keyed on the four-tuple `(studentId, schoolYear, semester, mandatory)`**, not just the first three. A student can have a different referent for a mandatory vs. an optional stage in the same semester. Reassigning a referent is an **in-place `UPDATE`** on the existing row (the unique tuple doesn't change) — never a second insert. A reassignment only affects live (`DRAFT`/`PENDING`) stages; anything already `VALIDATED`/`REFUSED` keeps its frozen snapshot untouched. No reassignment history in V1 (deferred to V2). (ADR-0014, BR-03, BR-06)
- **Calendar intervals are half-open `[start, end)`.** A school year is `[YYYY-09-01T00:00, (YYYY+1)-09-01T00:00)`. A stage period must end strictly before that upper bound — no "minus one minute" hacks, the exclusion of the bound is the mechanism. (BR-01, BR-04c, BR-05a/b/c, ADR-0009)
- **`schoolYear` has exactly one implementation.** A single Zod value-object in `packages/shared` (format `^\d{4}-\d{4}$`, second year = first + 1, normalization) governs `Stage.schoolYear`, `ReferentAssignment.schoolYear`, and `StudentProfile.profileYear`. A DB `CHECK` on format is defense in depth only — the N+1 semantic rule lives in Zod exclusively, never reimplemented in SQL or duplicated in another schema. (ADR-0012)
- **Submission requires a `VALID` profile** (BR-02); **validation requires an assigned referent** (BR-03); **the validated/refused snapshot is immutable and versioned** (BR-08); **stage writes use optimistic locking via `version`** (BR-09).

---

## 4. Workflow: spec-first + test-first

For any non-trivial task (new endpoint, new business rule, schema change — not a typo fix or a one-line style change), follow this sequence and don't skip steps:

1. **Restate the ask** and name the `BR-xx` / ADR / doc section it touches. If it's not covered by an existing doc, say so explicitly.
2. **Propose a plan**: files to touch/create, DTOs and their shape, edge cases, and whether a new ADR is needed (see below). **Wait for validation** before writing code, unless the user has pre-approved autonomous execution for this task.
3. **Write tests first.** Unit tests for business rules, e2e for controller-level contracts where relevant. Run them and confirm they fail for the _right_ reason (not a typo/import error).
4. **Implement** until green.
5. **Refactor** if needed without changing tested behavior. Re-run tests.

**When a new ADR is needed**: any decision that picks between real alternatives with lasting consequences (a new library, a schema shape, a concurrency strategy, an auth mechanism) — write the ADR _before_ or alongside the code, following the existing `docs/adr/NNNN-title.md` format and numbering. A decision that's purely a local implementation detail with no real alternative doesn't need one — use judgment, and when unsure, ask rather than silently deciding either way.

---

## 5. Backend conventions (NestJS)

### Module layout

One Nest module per business domain, not per technical layer:

```
apps/api/src/modules/
  auth/
  students/
  referents/
  stages/
  organisms/        # HostOrganism + Tutor
  admin/             # AdminSetting, OrganismStructureType, CSV export
  files/
```

Each module follows the standard Nest shape:

```
stages/
  stages.module.ts
  stages.controller.ts
  stages.controller.spec.ts   # or a Supertest e2e file under apps/api/test/
  stages.service.ts
  stages.service.spec.ts
  dto/
    create-stage.dto.ts
    update-stage.dto.ts
```

**Business logic lives in services, never in controllers.** Controllers only translate HTTP ↔ service calls (extract params, call the service, shape the response). This is the standard Nest separation and it's what makes the service layer unit-testable without spinning up HTTP.

### Validation: Zod via a hand-rolled pipe (not `class-validator`)

Nest's own default is `class-validator` + `class-transformer`, but this project's shared contract is Zod (ADR-0010, ADR-0012) — duplicating rules in `class-validator` would reintroduce exactly the divergence risk ADR-0012 exists to prevent. Instead:

- Business schemas live in `packages/shared` (e.g. `createStageSchema`).
- A small hand-written `ZodValidationPipe` in `apps/api/src/common/pipes/` wraps `schema.safeParse()` and throws a `BadRequestException` with a formatted error list on failure.
- Applied per-route (or via a small `@ZodBody(schema)` param decorator if it removes meaningful repetition — don't build that abstraction until you've written it by hand two or three times and felt the duplication).
- Types on the DTO side are `z.infer<typeof createStageSchema>` imported from `packages/shared`, not hand-written interfaces that can drift from the schema.

This is a deliberate deviation from the Nest default — document it in an ADR the first time it's introduced.

### RBAC

`Role` enum comes from `packages/shared`. A `JwtAuthGuard` handles authentication; a `RolesGuard` + `@Roles(...)` decorator handles authorization. A single `User` can carry multiple roles (`ADMIN` + `REFERENT`) — guards must check "has at least one of," not "has exactly."

### Data access

`PrismaService` is a single injectable provider (global `PrismaModule`), used directly in services. No repository-abstraction layer on top of Prisma — Prisma's client already is that abstraction; adding another one is speculative and unjustified at this scale (same YAGNI spirit as ADR-0002).

### Errors

Use Nest's built-in `HttpException` subclasses (`BadRequestException`, `NotFoundException`, `ConflictException` for the BR-09 version-mismatch case, etc.). Don't let raw Prisma errors reach the client — catch and translate at the service boundary or in a shared exception filter.

---

## 6. Frontend conventions (React)

### Structure

Feature folders, not technical-layer folders:

```
apps/web/src/features/
  auth/
  students/
  referents/
  stages/
  organisms/
```

Each feature owns its components, hooks, and API-calling functions. Shared, truly cross-feature UI (buttons, layout shell, form primitives) lives in `apps/web/src/components/`.

### Forms

`react-hook-form` + `@hookform/resolvers/zod`, resolving against the same schema imported from `packages/shared` used on the backend. Never hand-roll parallel frontend-only validation for a rule that already exists in a shared schema.

### Server state

TanStack Query (React Query) for anything that comes from the API (fetch/cache/invalidate); local component state (`useState`/`useReducer`) for pure UI state. Don't reach for a global store (Redux/Zustand) for server data — that's what React Query is for, and this app doesn't have complex enough client-only state to justify one.

### API client

A thin typed wrapper around `fetch`, typed against the request/response contracts in `packages/shared`. No `any` on request or response shapes.

### UI copy

French, hardcoded directly in components. No i18n library in V1 — this is a single-locale app and a full i18n setup would be speculative infrastructure. Revisit only if multi-locale is explicitly requested.

---

## 7. `packages/shared` — what goes here, what doesn't

```
packages/shared/src/
  schemas/     # Zod value-objects: schoolYear, stagePeriod, etc.
  enums/       # Role, Semester, ProfileStatus, StageStatus, FileType, Promotion
  contracts/   # per-domain request/response types, e.g. stages.contract.ts
```

**Rule**: a schema, enum, or type goes in `shared` only if it's genuinely used on both sides (API validation _and_ frontend forms/types, or API response _and_ frontend consumption). If it's only ever used by one app, keep it local to that app — don't pre-emptively "share" things that don't need it.

**Guardrail**: `packages/shared` must never import from `@nestjs/*` or `react`/anything web-specific. It has to stay runtime-agnostic or the whole point of sharing it collapses.

Consumed via the workspace protocol (`workspace:*`), never via relative paths reaching across the `apps/*` boundary.

---

## 8. Naming

| What | Convention | Example |
| --- | --- | --- |
| TS files | kebab-case | `create-stage.dto.ts` |
| React component files (web) | PascalCase, matching the exported component | `App.tsx`, `StageForm.tsx` |
| React hook files (web) | camelCase, matching the hook name | `useAuth.ts`, `useStageForm.ts` |
| Classes / types / enums | PascalCase | `StageStatus`, `CreateStageDto` |
| Variables / functions | camelCase | `computeSemester()` |
| Nest DTO files | `*.dto.ts` | `create-stage.dto.ts` |
| Nest guards/pipes/interceptors | `*.guard.ts`, `*.pipe.ts`, `*.interceptor.ts` | `roles.guard.ts` |
| Jest specs (api) | `*.spec.ts`, colocated | `stages.service.spec.ts` |
| Vitest specs (web) | `*.test.tsx`, colocated, matching the file under test's base name | `StageForm.test.tsx`, `api-client.test.ts` |
| Prisma models | PascalCase | `HostOrganism` |
| Prisma fields | camelCase | `profileYear` |
| Zod schemas | camelCase, `xSchema` suffix | `createStageSchema` |

---

## 9. Testing

- **`apps/api`**: Jest — the Nest default, colocated `*.spec.ts` for unit tests using `@nestjs/testing`'s `Test.createTestingModule()`, plus Supertest e2e tests under `apps/api/test/` for controller-level contracts. Mock `PrismaService` at the unit level; e2e tests hit a real (test) database.
- **`apps/web`**: Vitest — reuses `vite.config.ts` directly (aliases, env), no separate transform pipeline to keep in sync. React Testing Library for component tests.
- Test behavior, not implementation. Don't mock the domain logic you're trying to test.

**Every rule below needs a test that names the rule it covers** (in the test description, not just a comment) — this list doubles as an anti-omission checklist:

| Rule | What to assert |
| --- | --- |
| BR-04b | Semester derivation: all-S1 → S1, all-S2 → S2, straddling → S1; client-supplied semester is ignored |
| BR-01 / BR-05a-c | School-year and semester boundaries are half-open; a period ending exactly at next-year 09-01 00:00 is rejected, one ending 1ms before is accepted |
| BR-02 | Submission blocked when profile isn't `VALID`; draft creation allowed at any status |
| BR-03 | Validation blocked without a referent assignment for the stage's exact `(year, semester, mandatory)` combination; a referent assigned for the _other_ `mandatory` value doesn't satisfy it |
| BR-06 | Missing-referent dashboard warning fires per `(student, schoolYear, semester, mandatory)` combination tied to an actual eligible stage — not for every theoretical combination |
| BR-08 | Snapshot is written once, frozen, and unaffected by later edits to organism/tutor/referent/etc. |
| BR-09 | A write with a stale `version` is rejected with a conflict, not silently overwritten |
| ADR-0014 | Reassigning a referent updates the existing `ReferentAssignment` row (no unique-constraint conflict, no duplicate row); a live-stage reassignment never mutates an already-`VALIDATED`/`REFUSED` stage's snapshot |

---

## 10. Tooling & hooks (already configured — don't bypass)

- Husky pre-commit: gitleaks + ESLint (`--fix`) + Prettier on staged files.
- Husky commit-msg: `commitlint` (`@commitlint/config-conventional`) rejects a non-Conventional-Commits message locally (ADR-0015).
- Husky pre-push: gitleaks re-scan + `tsc --noEmit` across the monorepo.
- Never use `--no-verify`, never comment out a hook to "get past" a failure — fix the underlying issue.
- New env var → add it (name only, no value) to `.env.example`.
- Never commit a real secret, even temporarily, even in a script or a fixture. `.env` is git-ignored; use it for local values.
- Common commands: `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm -r test`, `pnpm secrets:scan`, `pnpm --filter api exec prisma migrate dev`, `pnpm changeset`.

---

## 11. Commits, versioning & releases

Full detail lives in `CONTRIBUTING.md` — read it before writing a commit message or PR description. The essentials to hold while generating code:

- Every commit message is **Conventional Commits** (`type(scope): summary`, imperative, lower-case, no trailing period). Reference the `BR-xx` it implements when there is one.
- A behavior-changing change needs a **changeset** (`pnpm changeset`) in the same unit of work, not as a follow-up — this feeds the SemVer bump and `CHANGELOG.md` on merge (ADR-0015). Pure `docs`/`ci`/`chore` changes don't need one.
- A `!` after the type/scope (plus a `BREAKING CHANGE:` footer) marks a MAJOR bump — use it deliberately, e.g. a migration that changes a unique constraint (as ADR-0014 did), not for routine refactors.
- The PR title itself must be a valid Conventional Commit — it becomes the squash-merge message.

---

## 12. Never do this

- Add a `referentId` FK to `Stage`.
- Accept `semester` as client input and persist it as-is.
- Implement anything from `docs/ROADMAP_V2.md` without an explicit ask.
- Duplicate the `schoolYear` format/semantic rule anywhere outside the shared Zod value-object (not in `class-validator`, not in a second regex, not in a raw SQL check beyond the format-only defense-in-depth already documented in ADR-0012).
- Use `class-validator` for request validation — see §5.
- Write to `Stage` without checking `version` (bypasses BR-09).
- Treat a validated/refused stage's live relations (`organism`, `tutor`, etc.) as the display source of truth — the snapshot is, once it exists.
- Model a referent reassignment as a new `ReferentAssignment` row, or key it on anything less than the full `(studentId, schoolYear, semester, mandatory)` tuple — see ADR-0014.
- Let a live-stage referent reassignment reach an already `VALIDATED`/`REFUSED` stage's frozen snapshot.
- Skip the plan-then-tests sequence in §4 for anything touching business rules, even if the fix "looks obvious."
- Introduce a new shared dependency, library, or architectural pattern without flagging it and, if it's structural, writing an ADR.
- Write a commit message that isn't a valid Conventional Commit, or land a behavior-changing PR without a changeset (ADR-0015).

---

## 13. Teaching mode (NestJS)

The user is experienced with backend/TypeScript in general but new to NestJS specifically. When introducing a Nest-specific idiom for the first time in a session (modules, providers/DI scopes, guards, pipes, interceptors, decorators, the request lifecycle) — give a short explanation (2-4 sentences) of _why this mechanism exists and why it fits here_, alongside the code, not instead of it. Skip explaining general TypeScript or backend concepts the user already knows; focus specifically on what's Nest-idiomatic and why. No need to re-explain a concept already covered earlier in the same session.

---

## 14. Agent skills

### Issue tracker

Issues live in GitHub Issues for `Bleupi/campus-internship`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — `docs/dataModel.md`, `docs/businessRules.md`, `docs/userFlow.md`, and `docs/adr/` at the repo root govern the whole system, not one context per pnpm package. See `docs/agents/domain.md`.
