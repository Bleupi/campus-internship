# ADR-0013 — Open-source (MIT), secret-scanning, and Git hooks

- Status: Accepted
- Deciders: dev
- Related: ADR-0010 (monorepo pnpm workspaces)

## Context

The project is published as a **public, open-source** demonstration repository
under the **MIT** license. A public repo with a database, object storage, and JWT
auth carries one dominant risk: **accidental secret leakage** (DB URL, S3/MinIO
keys, `JWT_SECRET`, a committed `.env`). Once pushed, a secret stays in Git
history even after removal. The safeguard must therefore prevent the commit in
the first place, and must be active for every contributor without a manual step.

## Decision

**License.** MIT (`LICENSE` at the repo root).

**Secret hygiene.**
- No secret is ever committed. Secrets live in a git-ignored `.env`; `.env.example`
  documents variable names with no values.
- `.gitignore` excludes `.env*` (except `.env.example`), key material, and build
  artifacts.
- `SECURITY.md` defines private vulnerability reporting, scope, and the app
  security baseline.

**Git hooks: Husky + lint-staged + gitleaks.**
Husky is chosen over native `.githooks` because Husky auto-activates via the
`prepare` script on `pnpm install` — native hooks require each clone to run
`git config core.hooksPath` manually, which is forgettable and unsafe for an
open-source repo. Husky installs once at the monorepo root; lint-staged routes
per-package.

**Placement by cost (a hook only protects if it is not bypassed):**

| Stage | Checks | Scope |
| ----- | ------ | ----- |
| pre-commit | gitleaks + ESLint (`--fix`) + Prettier (`--write`) | staged files only |
| pre-push | gitleaks (re-scan) + `tsc --noEmit` | whole monorepo |
| CI (later) | full test suite + `gitleaks detect` on history | everything |

Secret scanning runs at **both** pre-commit and pre-push. The full test suite is
**not** in any hook — it belongs to CI, so pre-commit stays fast and nobody is
trained to use `--no-verify`. `tsc` is whole-project by nature, so it sits at
pre-push rather than pre-commit.

## Consequences

- Contributors get protection automatically after `pnpm install`; no manual hook
  setup.
- gitleaks is a native binary, not an npm dependency: hooks warn and continue if
  it is absent locally, but **CI must run it** so the scan is never silently
  skipped. This is the one gap to close when CI is added.
- Alternatives rejected: native `.githooks` (manual activation, forgettable);
  the `pre-commit` framework (adds a Python toolchain to a JS/TS monorepo).
- Follow-up: add a CI workflow (GitHub Actions) running lint, typecheck, tests,
  and `gitleaks detect` on the full history. Tracked for a later change.
