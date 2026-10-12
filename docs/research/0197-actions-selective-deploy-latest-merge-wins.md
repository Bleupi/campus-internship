# Research: GitHub Actions mechanics for selective deploy and "latest merge wins"

Source ticket: https://github.com/Bleupi/campus-internship/issues/197 (map #195, builds on PRD #194)
Related: `.github/workflows/deploy.yml`, `docs/adr/0022-cicd-scaleway-deployment.md`, `docs/research/0084-deploy-concurrency-reject-semantics.md` (on branch `research/deploy-concurrency-reject-semantics`)
Date: 2026-10-12

## Short answer

- **Latest merge wins** comes for free from GitHub's default `concurrency` queue (`queue: single`). It keeps one running item and one pending item per group, and a newer pending item cancels the older pending one. Keep `cancel-in-progress: false` so a deploy that has started is never killed halfway (today's `deploy.yml` already does this).
- **A run parked on the `production` approval holds the group.** It counts as running, not as pending, and newer pushes do not supersede it. This repo shows it live right now (see §3).
- **Selective deploy should be decided inside the job, not by a trigger `paths` filter.** Diff `git diff --name-only <last successfully deployed SHA> $GITHUB_SHA` and map the changed paths to the services. The base comes from the GitHub Deployments API (the latest `production` deployment whose status is `success`). With that base, a change carried by a cancelled or evicted run is never lost: the next run's diff still contains it.
- **One group for the whole chain** (`deploy-production`, as today), not one group per service. PRD #194's chain is migration → API → web behind one approval, and per-service groups would break both the order and the single approval. Per-service selectivity is handled by step-level `if:`s inside the one deploy job.
- **Push order:** `main` is linear, so commit ancestry is push order. GitHub only says the queue is "FIFO … ordering is not guaranteed", so add an ancestry guard: never deploy a SHA that is an ancestor of the last deployed SHA.

## 1. Change detection on `push` to `main`

### Option A: trigger-level `on.push.paths` / `paths-ignore`

- How it decides: "If at least one path matches a pattern in the `paths` filter, the workflow runs." For pushes to an existing branch, "A two-dot diff compares the head and base SHAs directly with each other". That is the diff of **this push only**, not the diff since the last deploy.
- Limits: if a push has more than 1,000 commits the workflow always runs. Matches beyond the first 3,000 changed files are not evaluated.
- Required checks: a workflow skipped by a path filter leaves its checks "Pending", which blocks PRs that require them.
- Source: [Workflow syntax: `on.push.paths`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

For `deploy.yml` the required-check pitfall doesn't bite, because `deploy.yml` is not a PR check. Two other problems do:

- **It can only decide "run or not".** It can't decide which service to deploy.
- **The diff covers this push only.** When it is combined with the eviction described in §2, it can't express "everything not yet deployed".

At most, it could be a coarse "docs-only → no run" pre-filter. Even that is risky if you adopt the stale-run skip from §4: a docs-only push filtered at trigger level never creates the newer run that the skip relies on. **Recommendation: don't use it in `deploy.yml`.** Keep the path classification in one place, inside the job.

### Option B: `dorny/paths-filter` (third-party action, latest `v4.0.3`, 2026-08-05)

- For a push to a long-lived branch, it compares "against the most recent commit on the same branch before the push" by default.
- `base` can be set to any "Branch, tag, or commit SHA", so it can point at the last deployed SHA.
- It needs a checkout with enough history.
- Source: [dorny/paths-filter README](https://github.com/dorny/paths-filter).

It works, but it adds a third-party action that only wraps `git diff`. Under #194's constraints that action would need SHA pinning, Dependabot updates and an `impostor-commit` check (zizmor). The supply-chain risk of change-detection actions is real: `tj-actions/changed-files` was compromised and leaked secrets into logs (CVE-2025-30066, [GHSA-mrrh-fwg8-r2c3](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3), 2025-03-15). zizmor's `superfluous-actions` audit exists precisely to flag actions that duplicate what the runner already has ([zizmor audits](https://docs.zizmor.sh/audits/)).

### Option C (recommended): plain `git diff` against the last *deployed* SHA, in-job

1. Read the base: `GET /repos/{owner}/{repo}/deployments?environment=production` returns deployments with the `sha` "recorded at creation time" ([REST: deployments](https://docs.github.com/en/rest/deployments/deployments)). For each deployment, `GET …/deployments/{id}/statuses` returns states among `error, failure, inactive, pending, success, queued, in_progress` ([REST: deployment statuses](https://docs.github.com/en/rest/deployments/statuses)). Take the newest deployment that has a `success` status.
   - Actions creates these objects itself: "By default, when a workflow job references an environment, GitHub creates a deployment object" ([Control deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)). Setting `deployment: false` turns this off ([workflow syntax: `jobs.<job_id>.environment`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)). **That flag must never be set on the deploy job**, or the base disappears.
   - Checked on this repo (`gh api`): `task: deploy`, `ref: main`, `sha` = the run's commit, statuses `waiting → queued → in_progress → success`. `waiting` shows up in practice but is not in the documented enum.
   - The job needs `permissions: deployments: read`. Reading statuses needs only "pull access".
2. Diff: `actions/checkout` with `fetch-depth: 0` and `persist-credentials: false`, then `git diff --name-only "$BASE" "$GITHUB_SHA"`.
3. Classify the paths in one script:
   - `apps/api/**` → api (+ migration Job).
   - `apps/web/**` → web.
   - `packages/shared/**`, the root lockfile/`package.json`, `pnpm-workspace.yaml` → both (map #195 decision).
   - `docs/**`, `*.md`, `.changeset/**` → nothing.

   **Undecided:** where `.github/workflows/deploy.yml` changes go (map them to "both" to be safe?). Expose the result as job outputs (`api=true|false`, `web=true|false`).
4. Fallbacks that deploy everything:
   - no successful deployment exists yet;
   - `git merge-base --is-ancestor "$BASE" "$GITHUB_SHA"` fails (history rewritten, base unknown).

**Why one base covers both services.** Every successful run deploys every service whose paths changed in `diff(base, HEAD)`. So after a `success` at SHA S, every service's deployed code matches S on that service's paths. A later `diff(S, new)` therefore catches everything not yet deployed, whichever service it touches.

A partially failed chain (migration OK, API failed) ends with a `failure` status. The base stays at the previous success and the next run re-diffs from there. This works because the deployment object is per *job*, and #194 makes the whole chain one job.

**Undocumented:** the REST page doesn't state the list order. It is newest first in practice. Sort by `created_at` explicitly rather than relying on it.

**Alternative base: ask the platform** (the image actually running on each Scaleway container). It is truer to reality, but #194 deploys by digest, so the SHA isn't visible in the image reference. Recovering it needs either an OCI `org.opencontainers.image.revision` label lookup or a marker env var set on the container. That is out of scope for a GitHub-mechanics note and should be verified against Scaleway docs if preferred.

## 2. `concurrency` semantics

All quotes are from [Workflow syntax: `concurrency`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency) and [Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

- "there can be at most one running job or workflow in a concurrency group at any time."
- "By default, any existing `pending` job or workflow in the same concurrency group will be canceled" when a new one queues. So with `cancel-in-progress: false`, the **newest pending is kept and the older pending is cancelled**. That is exactly "latest merge wins".
- "To also cancel any currently running job or workflow in the same concurrency group, specify `cancel-in-progress: true`." Not wanted here: it would also kill a chain mid-deploy.
- `queue`:
  - `single` (default): "At most one job or workflow run can be `pending`".
  - `max`: "Up to 100 … can be `pending`", queued in order. `max` is the opposite of latest-wins (it deploys every intermediate commit), and "The combination of `queue: max` and `cancel-in-progress: true` is not allowed". **Keep the default.**
- Ordering: "processed in first-in-first-out (FIFO) order according to the time each one started waiting on the concurrency group", but "Since the actual start time of a job or run may vary, ordering is not guaranteed."
- Job-level `jobs.<job_id>.concurrency` has the same semantics at job granularity. "`concurrency` and `environment` are not connected": the group name is free text ([Control deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)).
- Group names are case-insensitive and global to the repo. A name reused by another workflow shares the queue with it.

### Workflow-level vs job-level group, and per-service groups

**Workflow-level group (today's `deploy-production`).** The whole run, build included, is serialized:

- Detection reads the base when the run *starts*, and the previous run has finished by then, so the base is fresh.
- An evicted pending run never started any job. The cancelled run `62692cb` (2026-09-26) has 0 jobs and was cancelled at the second `084bb5b` was queued, which is exactly the eviction.
- Cost: build time sits inside the serialized window.

**Job-level group on the deploy job only.** Builds run in parallel, and only the deploy is serialized. But detection done in the build job reads the base *before* the job holds the group, and a deploy that finishes in between moves the base. The deploy job must then recompute the diff and fail or skip safely if it needs an image that wasn't built. **This is more moving parts. Prefer workflow-level unless build time becomes a real problem.**

**Per-service groups (`deploy-api`, `deploy-web`).** This means separate jobs:

- It breaks #194's single fail-fast chain (migration → API → web, "the web UI never calls routes the API doesn't serve yet"). A web deploy could run ahead of the API change it depends on.
- Each job that references `production` waits for approval separately. A `needs:` chain asks for approval twice.

**Not recommended.** Per-service selectivity belongs in step `if:`s inside one chain.

## 3. A run waiting for `production` approval holds the group

- Docs: "While a job is awaiting approval, it has a status of 'Waiting'. If a job is not approved within 30 days, it will automatically fail." ([Control deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)). The protection rules run after the job has been queued in its group: "All deployment protection rules must pass before a job referencing the environment is sent to a runner" ([workflow syntax: `jobs.<job_id>.environment`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- GitHub's docs never say explicitly whether a `Waiting` job counts as running or pending for concurrency. The evidence below shows it counts as **running**.
- Live evidence in this repo (`gh run list --workflow deploy.yml`, 2026-10-12):
  - run `36633599404` (`83c128d`) has run-level status **`waiting`** and has held `deploy-production` since 2026-09-29;
  - run `37765139308` (`f3650d5`, 2026-10-08) is **`pending`** behind it.
  - The waiting run was not superseded, and the newer run queues behind it.
- Third-party corroboration: [AudiusProject/apps#14546](https://github.com/AudiusProject/apps/pull/14546) (merged 2026-08-04) reports that a job at an approval gate "keeps its run in progress for as long as it waits — holding the group", and that "GitHub keeps only one pending run per group".

**Consequences:**

- Latest-wins applies **among pending runs only**. The run at the gate is never superseded. Approving it deploys an older SHA, and then the newest pending run goes next (two approvals).
- To get "the newest push replaces the one awaiting approval", the maintainer has to **Reject** or **Cancel** the stale waiting run. Both free the group (see the #84 research note).
- `cancel-in-progress: true` would automate this but also kills a chain mid-deploy. **Don't.**
- A structural alternative splits the run into an approval-only job in a `cancel-in-progress: true` group and a deploy job in a `cancel-in-progress: false` group. But the deploy job then needs the environment secret without a second approval, which means a second, reviewer-less environment. That weakens #194's "deploy credential only after approval" stance. **It's a trade-off for a grilling ticket, not a mechanics fact.**

## 4. Guaranteeing push-time order

Squash merges keep `main` linear, so `git merge-base --is-ancestor A B` is equivalent to "A was pushed before B". GitHub only promises best-effort FIFO, so the deploy job should check:

- **Never go backwards.** If `$GITHUB_SHA` is an ancestor of (or equal to) the last successfully deployed SHA, skip with a notice. This covers out-of-order starts and the approve-a-stale-run case.
- **Optional stale skip.** If `$GITHUB_SHA` isn't the current tip of `origin/main`, a newer run exists and will deploy a superset, so this run could skip. This is only safe if that newer run is guaranteed to exist: no trigger-level path filter (§1A), and nobody cancels it. **It is safer to treat this as advisory.**
- PR number is irrelevant. Only the push order on `main` (the run's `GITHUB_SHA`, "Tip commit pushed to the ref", [events: `push`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)) matters.

## 5. Not losing changes from cancelled runs

**Scenario:** run N (api change) is pending, and run N+1 (web-only) evicts it.

- With the base = last *deployed* SHA, run N+1's `diff(base, N+1)` contains N's api change, so it deploys api and web. Nothing is lost.
- With `github.event.before` or "previous commit" as the base (the trigger-filter and paths-filter defaults), the api change would be silently dropped.

**The image must be built from the run's own SHA.** Builds are decided by the same diff, and `HEAD` contains every earlier commit, so building at `N+1` includes N's change.

The same reasoning covers a rejected, cancelled or failed run: none of them records a `success` deployment status, so the base doesn't move.

## Pitfalls checklist

- Never set `deployment: false` on the deploy job. It removes the deployment record that the base comes from.
- `fetch-depth: 0`, or at least enough history to contain the base. Otherwise `git diff` fails. Treat a failure as "deploy everything", never as "deploy nothing".
- Pass `${{ }}` values to `run:` via `env:`, never inline (zizmor `template-injection`). Today's `deploy.yml` inlines `${{ env.REGISTRY }}` and `${{ github.sha }}` in `run:`, which #194's zizmor pass will flag anyway.
- `permissions:` per job: `contents: read` and `deployments: read` for detection, nothing broader (zizmor `excessive-permissions`).
- A run left at the gate blocks every later deploy until approved, rejected, cancelled, or 30 days pass. One is in that state on this repo right now (§3).
- `queue: max` is the wrong tool here: it is the opposite of latest-wins.
- The concurrency group name is repo-global and case-insensitive. Keep `deploy-production` unique to `deploy.yml`.
- zizmor's pedantic `concurrency-limits` audit wants superseded runs cancelled. Our `cancel-in-progress: false` is deliberate and may need a documented ignore if pedantic mode is ever enabled.

## Open questions

- No GitHub page states in one sentence that a `Waiting`-for-approval job occupies the running slot. It is established here from this repo's live runs and one third-party report.
- The order of List-deployments results is undocumented. Sort explicitly.
- The `waiting` deployment-status state appears in practice but not in the documented REST enum.

## Sources

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax (concurrency, `on.push.paths`, `jobs.<job_id>.environment`)
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push
- https://docs.github.com/en/rest/deployments/deployments
- https://docs.github.com/en/rest/deployments/statuses
- https://github.com/dorny/paths-filter
- https://github.com/advisories/GHSA-mrrh-fwg8-r2c3
- https://docs.zizmor.sh/audits/
- https://github.com/AudiusProject/apps/pull/14546 (secondary, corroboration only)
- Live repo data: `gh run list -R Bleupi/campus-internship --workflow deploy.yml`, `gh api repos/Bleupi/campus-internship/deployments?environment=production`
