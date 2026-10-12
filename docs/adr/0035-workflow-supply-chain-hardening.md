# ADR-0035 — Workflow supply-chain hardening: SHA/digest pinning, Dependabot cooldown, actionlint + zizmor

- Status: Accepted
- Date: 2026-10-12
- Deciders: project owner

## Context

ADR-0028 put a human between "proposed" and "merged" for every change, and gave Dependabot the npm dependencies. It said nothing about the code the workflows themselves run: third-party actions, CI service images, and the workflow files. A tag such as `actions/checkout@v7` or an image such as `minio:latest` can be moved by whoever controls it, and the next run picks up the new code without any PR in this repo. `deploy.yml` also only runs after merge, so a mistake in it surfaces in production, not in review.

Built from #211, part of the PRD #194 (user stories 27 to 35).

## Decision

### 1. Pin everything a workflow runs to an immutable reference

- Every `uses:` is pinned by full commit SHA, with the release tag in a trailing comment (`@<sha> # v7.0.1`). The comment is what Dependabot reads and rewrites, and what a reviewer reads.
- CI service images are pinned by digest, keeping the tag for readability (`postgres:16-alpine@sha256:...`). For `cgr.dev/chainguard/minio`, `latest` is the only free tag, so the digest is the only thing that fixes what runs.
- The two linters below are pinned too: actionlint by image digest, zizmor through its SHA-pinned action plus an exact `version` (the action maps it to a digest-pinned image).

### 2. Dependabot keeps the pins fresh, after a 7-day cooldown

Two ecosystems join the npm ones from ADR-0028:

- `github-actions` (bumps the SHA and its version comment), all updates in one weekly group;
- `docker` for the base images of `apps/api/Dockerfile` and `apps/web/Dockerfile`, one weekly group.

Every block, npm included, sets `cooldown: default-days: 7`: a version update is proposed only once the release is a week old, so a compromised release has time to be found and pulled first. GitHub's Dependabot options reference states that `cooldown` applies to version updates only, never to security updates, so fixes for a known advisory are not delayed.

### 3. actionlint and zizmor gate every PR

A `lint-workflows` job in `pr-validation.yml` (display name `Lint workflows (actionlint, zizmor)`) runs both tools on every PR, with no path filter, and is a required check on `main` alongside the two from ADR-0028. A path filter would leave the required check unreported on PRs that don't touch `.github/`, and those PRs would never become mergeable.

- **actionlint**: workflow syntax, expressions, and shellcheck on every `run:` script. It is the only check `deploy.yml` gets before merge.
- **zizmor**: security audits (unpinned references, template injection, credential persistence, over-broad permissions, missing Dependabot cooldown, ...), including its online audits with the job's read-only token. Results are emitted as annotations rather than uploaded to code scanning, which would need a `security-events: write` permission this workflow doesn't otherwise have.

The first pass leaves no unexplained finding. Each one was fixed, except two suppressions written next to the code they cover:

- actionlint's "unexpected key `command`" on the MinIO services (`.github/actionlint.yaml`): `services.<id>.command` is documented by GitHub, actionlint 1.7.12 predates it, and the MinIO image needs it to start.
- zizmor's `secrets-outside-env` on the registry login in `deploy.yml`: that job pushes images before the production approval, so its credential can't live in the `production` environment. #216 decides which key it uses.

zizmor's `auditor` persona (which shows the findings the default persona hides) was also run once and is clean apart from that second suppression. CI runs the default persona.

### 4. `actions/checkout` does not persist Git credentials

Every checkout sets `persist-credentials: false`. No step pushes or fetches after checkout, so the token has no reason to stay in `.git/config`, where later steps or an uploaded artifact could read it.

## Consequences

- The workflows run exactly the code that was reviewed. Changing an action or image version is a reviewed PR, from Dependabot or by hand.
- Dependabot doesn't read `services:` images in workflow files (its `github-actions` ecosystem only parses `uses:`, and its `docker` ecosystem only reads YAML that looks like a Kubernetes or Helm manifest). The two service digests are refreshed by hand; the workflow comment says how. A stale CI test image is a low-cost failure: it only affects what the tests run against, never what is deployed.
- The tools' own pins follow the same split: zizmor-action is bumped by Dependabot, but the `version:` input and the actionlint image digest are bumped by hand.
- New findings from a tool upgrade fail the PR that brings the upgrade, which is where they belong.
- Same caveat as ADR-0028: the required check is matched by the job's `name:`. Renaming it without updating `main`'s rules leaves every PR waiting on a check that never reports.
- Cooldown slows routine updates by a week. Security updates are unaffected.

## Alternatives considered

- **Tags or major-version refs (`@v7`) with no pinning.** What the workflows used before. Convenient, but the code behind a tag can change without a PR here.
- **Renovate**, which can update workflow `services:` images. Rejected for the same reason as in ADR-0028: a third-party app for one gap that two hand-refreshed digests cover.
- **Path-filtering the lint job to `.github/**`.** Cheaper, but incompatible with a required check (see Decision §3).
- **Installing actionlint through a third-party action.** No official action exists; the official image, pinned by digest, adds no new party to trust.
- **Uploading zizmor's SARIF to code scanning.** Gives a findings history in the Security tab, but needs `security-events: write` on a job that runs for every PR. Annotations on the PR are enough for a single maintainer.

## Related

PRD #194. Ticket #211. Sibling tickets #212 (branch rules for administrators), #216 (one credential per deploy job).

- ADR-0013 (open-source security, git hooks) — the local secret scanning this adds a workflow-level layer next to.
- ADR-0022 (CI/CD and Scaleway deployment) — the two workflows hardened here.
- ADR-0028 (dependency-vulnerability automation) — extended, not changed: Dependabot gains two ecosystems and a cooldown, and `main` gains a third required check.
