# ADR-0015 — Conventional Commits + SemVer 2.0.0, releases via Changesets

- Status: accepted
- Date: 2026-08-17
- Deciders: project owner
- Related: ADR-0010 (pnpm monorepo), ADR-0013 (Git hooks)

## Context

The project is, among other things, a portfolio piece: the commit history and release process are part of what a reviewer will judge. We want commit messages that are consistent and machine-readable, versions that follow a well-known scheme, and a changelog that is generated rather than hand-maintained.

Three concerns are often conflated and should be kept distinct:

1. **Message format** — how a commit is written.
2. **Versioning scheme** — how release numbers are chosen.
3. **Release tooling** — what turns (1) and (2) into tags and a changelog.

Semantic Versioning 2.0.0 addresses (2) only; it says nothing about commit messages. The convention designed to *feed* SemVer from commit history is Conventional Commits, which addresses (1). Tooling then bridges them.

## Decision

Adopt all three, explicitly separated:

- **Conventional Commits 1.0.0** for every commit message. Allowed types and
  their SemVer impact are documented in `CONTRIBUTING.md`. A `!` marker or a `BREAKING CHANGE:` footer forces a MAJOR bump.
- **Semantic Versioning 2.0.0** for package version numbers.
- **Changesets** as the release tool. In a pnpm workspace monorepo (ADR-0010),
  Changesets is the idiomatic choice: each behaviour-changing PR adds a changeset file declaring the bump level per affected package; on merge to `main`, a workflow consumes pending changesets, bumps versions, writes `CHANGELOG.md`, and tags the release.

Enforcement reuses the existing Git-hook infrastructure (ADR-0013):

- `commitlint` with `@commitlint/config-conventional` on the Husky `commit-msg` hook, rejecting non-conforming messages locally.
- CI re-validates the PR title (which becomes the squash-merge message) and fails a behaviour-changing PR that ships without a changeset.

## Consequences

- Commit history is uniform and parseable; the changelog is a build artefact, not a manual file.
- Contributors must learn the type vocabulary and remember to run `pnpm changeset` when behaviour changes. `CONTRIBUTING.md` documents the loop; CI is the safety net.
- Version bumps are decided per changeset rather than inferred purely from commit types. This is deliberate: it keeps a human in the loop on release scope while still deriving the changelog text from the commits. (Choosing `semantic-release` instead would fully automate bumps from commit types but fits a single-package repo better than a monorepo — see alternatives.)
- New tooling to configure and keep current: `@commitlint/*`, `husky`, `@changesets/cli`, and the release workflow.

## Alternatives considered

- **semantic-release.** Fully automates versioning from commit types. Rejected as the primary tool for a pnpm *monorepo*: per-package versioning and the changeset-per-PR review step are cleaner with Changesets. semantic-release is the stronger pick for a single publishable package.
- **Plain SemVer with a hand-written changelog.** Rejected: manual changelogs drift and add release friction; the automation is cheap and is itself a portfolio signal.
- **No commit convention.** Rejected: loses the machine-readability that makes automated changelog generation possible and weakens the portfolio value of the history.
