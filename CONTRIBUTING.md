# Contributing

> Conventions for this repository. Kept intentionally strict: this project doubles as a portfolio piece, so the history and workflow are part of the deliverable.

## Table of contents

1. [Commit convention](#commit-convention)
2. [Versioning & changelog](#versioning--changelog)
3. [Branching & pull requests](#branching--pull-requests)
4. [Working with Claude Code](#working-with-claude-code)
5. [Local checks](#local-checks)

---

## Commit convention

This repository follows **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)**, which drives **[Semantic Versioning 2.0.0](https://semver.org/)** through Changesets (see below).

> Note on terminology: SemVer versions _releases_ (`MAJOR.MINOR.PATCH`). Conventional Commits is the _message_ format that feeds SemVer. Together they let versions and the changelog be generated from the commit history rather than bumped by hand.

### Format

```
<type>(<scope>)<!>: <description>

[optional body]

[optional footer(s)]
```

- **type** — required, from the allowed list below.
- **scope** — optional, the area touched (`stage`, `referent`, `profile`, `auth`, `organism`, `pdf`, `schoolYear`, `ci`, …). Prefer a business/domain scope over a technical one.
- **!** — append after the scope to flag a breaking change (also add a `BREAKING CHANGE:` footer).
- **description** — imperative mood, lower-case, no trailing period, ≤ ~72 chars.

### Allowed types → SemVer impact

| Type       | Purpose                                              | SemVer bump |
| ---------- | ---------------------------------------------------- | ----------- |
| `feat`     | a new feature                                        | MINOR       |
| `fix`      | a bug fix                                            | PATCH       |
| `perf`     | a performance improvement                            | PATCH       |
| `refactor` | code change that neither fixes a bug nor adds a feat | none        |
| `docs`     | documentation only                                   | none        |
| `test`     | adding or fixing tests                               | none        |
| `build`    | build system or dependencies                         | none        |
| `ci`       | CI configuration                                     | none        |
| `style`    | formatting, whitespace (no code meaning change)      | none        |
| `chore`    | anything else that doesn't touch src or tests        | none        |
| `revert`   | reverts a previous commit                            | contextual  |

A `!` or a `BREAKING CHANGE:` footer forces a **MAJOR** bump regardless of type.

### Examples

```
feat(stage): derive semester from periods, S1 wins on straddle (BR-04b)
fix(referent): reassign in place without violating unique constraint (BR-03)
feat(referent)!: key assignment on (student, year, semester, mandatory)

BREAKING CHANGE: ReferentAssignment unique key gains the `mandatory` axis;
existing rows must be backfilled before the migration is applied.
docs(businessRules): clarify BR-06 warning per mandatory/optional combination
refactor(schoolYear): move N+1 semantic rule into the shared Zod value-object
test(stage): cover half-open end bound at 01 Sep 00:00 (BR-05c)
```

### Enforcement

`commitlint` (config `@commitlint/config-conventional`) runs on the `commit-msg` Git hook via Husky (see ADR-0013). A message that doesn't parse is rejected locally, and re-checked in CI on the PR title.

---

## Versioning & changelog

Versions and `CHANGELOG.md` are managed by **[Changesets](https://github.com/changesets/changesets)** — the idiomatic choice for a pnpm monorepo (ADR-0010, ADR-0015).

Workflow:

1. Make your change on a branch, committing with Conventional Commits.
2. Run `pnpm changeset` and describe the change; select the bump level (patch / minor / major) for each affected package. This writes a markdown file under `.changeset/`.
3. Commit the changeset file with your work.
4. On merge to `main`, the release workflow consumes pending changesets, bumps versions, updates `CHANGELOG.md`, and tags the release.

A PR that changes user-facing behaviour without a changeset should fail CI. Pure `docs`/`ci`/`chore` PRs may legitimately have none.

---

## Branching & pull requests

- Branch off `main`: `feat/<short-slug>`, `fix/<short-slug>`, etc.
- Keep PRs small and single-purpose; one business rule or use case at a time maps well onto the numbered `BR-xx` items.
- The **PR title must itself be a Conventional Commit** — it becomes the squash commit message.
- **Reference the business rule** you implement or change in the description (e.g. "implements BR-03", "updates BR-06").
- CI must be green: lint, type-check, tests, commitlint, and a pending changeset when behaviour changed.

---

## Working with Claude Code

Most of this codebase is produced with **Claude Code**. To keep output clean and reviewable, follow this loop rather than asking for large unscoped generations.

### Ground rules

- **The docs are the source of truth.** `dataModel.md`, `businessRules.md` and `userFlow.md` define the contract. Code follows them; when a conflict is found, fix the doc _first_ (its own PR) then the code — never let them silently drift.
- **One unit of work per session.** A single `BR-xx`, a single use case, or a single module. Small diffs review better and keep the git history meaningful.
- **A `CLAUDE.md` at the repo root** carries the durable context Claude Code should load every time (stack, conventions, commands, the pointer to the three design docs, and the commit convention above). Keep it short and current — it is loaded on every run, so noise there is expensive.
- **Tests are part of the task, not a follow-up.** Every `BR-xx` should map to a testable unit (as stated at the top of `businessRules.md`); ask for the test in the same session as the implementation.

### Suggested per-task loop

1. **Plan** — ask Claude to restate the target `BR-xx`/use case, list the files it will touch, and outline the approach _before writing code_. Correct the plan, not the code.
2. **Implement** — one focused change, with its Zod schema/validation and tests.
3. **Self-review** — ask Claude to check the diff against the referenced business rule and the data model, and to flag any doc inconsistency it noticed.
4. **Commit** — a Conventional Commit message referencing the `BR-xx`, plus a changeset if behaviour changed.

### What to put in `CLAUDE.md`

- Stack & versions: NestJS + React + PostgreSQL, TypeScript, Prisma, Zod, pnpm workspaces.
- Commands: install, dev, test, lint, type-check, prisma migrate, changeset.
- Conventions: English code/schema, French UI; Conventional Commits; half-open temporal intervals (ADR-0009); schoolYear value-object (ADR-0012).
- Pointers: "read `docs/` design files before implementing any `BR-xx`."
- Guardrails: never invent business rules; never accept a client-supplied `semester` (BR-04b); never mutate a frozen snapshot (BR-08).

> Keep `CLAUDE.md` under version control and update it in the same PR whenever a convention changes, so the assistant's context never lags the codebase.

---

## Local checks

Before pushing:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm changeset        # if behaviour changed
```

Husky runs `commitlint` on `commit-msg` and the lint/format staged-file checks on `pre-commit`. Don't bypass hooks (`--no-verify`) on shared branches.
