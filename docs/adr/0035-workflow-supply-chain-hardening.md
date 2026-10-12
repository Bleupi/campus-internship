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
- The two linters below are pinned too, in a way Dependabot can update (Decision §3):
  - **actionlint** is built from source in the job, from a Go module that declares it as a tool (`.github/tools/go.mod`). `go.sum` pins the hash of actionlint and of each dependency, and Go checks them against its public checksum database (sum.golang.org), so a published version can't be swapped afterwards.
  - **zizmor** runs through its SHA-pinned action with no `version:` input. Each zizmor-action release maps its default to a single zizmor image digest, so pinning the action pins zizmor.

### 2. Dependabot keeps the pins fresh, after a 7-day cooldown

Three ecosystems join the npm ones from ADR-0028:

- `github-actions` (bumps the SHA and its version comment), all updates in one weekly group;
- `docker` for the base images of `apps/api/Dockerfile` and `apps/web/Dockerfile`, one weekly group;
- `gomod` for `.github/tools` (actionlint and its dependencies), one weekly group.

With these, both linters reach the maintainer as Dependabot PRs: actionlint through `gomod`, zizmor through the zizmor-action bump in `github-actions`. A security tool that has to be remembered gets forgotten.

Every block, npm included, sets `cooldown: default-days: 7`: a version update is proposed only once the release is a week old, so a compromised release has time to be found and pulled first. `default-days` covers major updates too, not only minor and patch: a major bump is never urgent, and the `docker` ecosystem only supports `default-days` anyway, so one setting reads the same in every block. GitHub's Dependabot options reference states that `cooldown` applies to version updates only, never to security updates, so fixes for a known advisory are not delayed.

### 3. actionlint and zizmor gate every PR

A `lint-workflows` job in `pr-validation.yml` (display name `Lint workflows (actionlint, zizmor)`) runs both tools on every PR, with no path filter, and is a required check on `main` alongside the two from ADR-0028. A path filter would leave the required check unreported on PRs that don't touch `.github/`, and those PRs would never become mergeable.

- **actionlint**: workflow syntax, expressions, and shellcheck on every `run:` script. It is the only check `deploy.yml` gets before merge. shellcheck is the runner's preinstalled one. actionlint quietly skips shellcheck when the binary is missing, so the job passes its path explicitly and fails without it.
- **zizmor**: security audits (unpinned references, template injection, credential persistence, over-broad permissions, missing Dependabot cooldown, ...), including its online audits with the job's read-only token. Results are emitted as annotations rather than uploaded to code scanning, which would need a `security-events: write` permission this workflow doesn't otherwise have.

The first pass leaves no unexplained finding. Each one was fixed, except two suppressions written next to the code they cover:

- actionlint's "unexpected key `command`" on the MinIO services (`.github/actionlint.yaml`): `services.<id>.command` is documented by GitHub, actionlint 1.7.12 predates it, and the MinIO image needs it to start.
- zizmor's `secrets-outside-env` on the registry login in `deploy.yml`: the login runs before the production approval by design. Credential scoping per job is #216, which revisits this suppression.

zizmor's `auditor` persona shows 7 findings the default persona hides. They were reviewed once:

- `template-injection` × 4 (`${{ env.REGISTRY }}` and `${{ github.sha }}` inside the two deploy `run:` scripts): fixed by reading `$REGISTRY` and `$GITHUB_SHA` from the shell environment instead.
- `unpinned-images` × 2 (`postgres:16-alpine`, tagged but not digest-pinned): fixed by the digest pinning above.
- `secrets-outside-env` × 1: the suppression above.

CI runs the default persona.

### 4. `actions/checkout` does not persist Git credentials

Every checkout sets `persist-credentials: false`. No step pushes or fetches after checkout, so the token has no reason to stay in `.git/config`, where later steps or an uploaded artifact could read it.

## Consequences

- The workflows run exactly the code that was reviewed. Changing an action or image version is a reviewed PR, from Dependabot or by hand.
- Dependabot doesn't read `services:` images in workflow files (its `github-actions` ecosystem only parses `uses:`, and its `docker` ecosystem only reads YAML that looks like a Kubernetes or Helm manifest). The two service digests are refreshed by hand; the workflow comment says how. A stale CI test image is a low-cost failure: it only affects what the tests run against, never what is deployed.
- The Dockerfiles' base images stay referenced by tag (`node:24-alpine`, `nginx:1.27-alpine`): Dependabot proposes tag bumps for them, not digest refreshes. Pinning them is out of this ADR's scope, which covers what the workflows run.
- Both linters are updated through Dependabot PRs, under the same cooldown and review as everything else. shellcheck is the exception: it follows GitHub's runner image rather than a pin of ours.
- The lint job sets up Go and compiles actionlint on every run, without a module cache. It takes about 10 to 20 seconds more than pulling an image, which doesn't lengthen a PR's wait: the job runs in parallel with the 3-minute e2e job.
- New findings from a tool upgrade fail the PR that brings the upgrade, which is where they belong.
- Same caveat as ADR-0028: the required check is matched by the job's `name:`. Renaming it without updating `main`'s rules leaves every PR waiting on a check that never reports.
- Cooldown slows routine updates by a week. Security updates are unaffected.

## Alternatives considered

- **Tags or major-version refs (`@v7`) with no pinning.** What the workflows used before. Convenient, but the code behind a tag can change without a PR here.
- **Renovate**, which can update workflow `services:` images. Rejected for the same reason as in ADR-0028: a third-party app for one gap that two hand-refreshed digests cover.
- **Path-filtering the lint job to `.github/**`.** Cheaper, but incompatible with a required check (see Decision §3).
- **The `rhysd/actionlint` Docker image, pinned by digest** (this ADR's first draft). It is the author's own build, pushed from the upstream release workflow and never re-pushed since. Rejected after a security check, though:
  - the image is unsigned, unlike the release binaries;
  - its Alpine packages are only rebuilt when actionlint releases (Grype found 12 critical and 102 high CVEs, all in those OS packages, none in actionlint or shellcheck);
  - a digest in a `run:` script is invisible to Dependabot.
- **A release binary checked with `gh attestation verify`.** The provenance is strong, but Dependabot can't bump a version in a script, so updates would depend on someone remembering.
- **Installing actionlint through a third-party action.** No official action exists, and it would add a new party to trust.
- **Uploading zizmor's SARIF to code scanning.** Gives a findings history in the Security tab, but needs `security-events: write` on a job that runs for every PR. Annotations on the PR are enough for a single maintainer.

## Related

PRD #194. Ticket #211. Sibling tickets #212 (branch rules for administrators), #216 (one credential per deploy job).

- ADR-0013 (open-source security, git hooks) — the local secret scanning this adds a workflow-level layer next to.
- ADR-0022 (CI/CD and Scaleway deployment) — the two workflows hardened here.
- ADR-0028 (dependency-vulnerability automation) — extended, not changed: Dependabot gains two ecosystems and a cooldown, and `main` gains a third required check.
