# Research: GitHub Actions concurrency + environment-protection-reject semantics for the deploy pipeline

Source ticket: https://github.com/Bleupi/campus-internship/issues/84
Related: docs/adr/0022-cicd-scaleway-deployment.md, .github/workflows/deploy.yml

## Q1: What happens when a required reviewer clicks Reject?

**Rejection outcome.** GitHub's "Reviewing deployments" doc states this plainly:

> "To reject the job, click **Reject**." ... "If a job is rejected, the workflow will fail."
— [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)

So a Reject is not a cancellation — it is a **failure**. The REST API confirms the same action programmatically: `POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` takes a `state` of `approved` or `rejected` ("Whether to approve or reject deployment to the specified environments") — [Review pending deployments for a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#review-pending-deployments-for-a-workflow-run). GitHub's documented enum of run/job `conclusion` values includes both `failure` and `cancelled` as distinct terminal outcomes — [Get a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run) — and Reject maps to `failure`, not `cancelled`.

**What "awaiting approval" looks like beforehand.** While parked, the job carries its own status:

> "While a job is awaiting approval, it has a status of 'Waiting'. If a job is not approved within 30 days, it will automatically fail."
— [Deploying with GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

`waiting` is a documented value in the job/run `status` enum in the REST API (alongside `queued`, `in_progress`, `completed`, `requested`, `pending`) — [Workflow runs — REST API](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run). A job in `waiting` status has already started (its parent run has progressed past `queued`); it is not sitting in the concurrency group's `pending` slot — it occupies the group's single `running` slot. This matches the premise already settled for this investigation, and is corroborated by GitHub's own description of how concurrency interacts with environments:

> "Concurrency ensures that only a single job or workflow using the same concurrency group will run at a time. You can use concurrency so that an environment has a maximum of one deployment in progress at a time." ... "there will be a maximum of one running and one pending job or workflow [that] uses the `production` concurrency group."
— [Concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)

**Does rejecting free the concurrency group?** GitHub's concurrency documentation states the group-occupancy rule in general terms:

> "When you limit concurrency, by default only one run can be pending in a concurrency group — any additional pending runs cancel the previous one."
— [Concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)

> "By default, any existing `pending` job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place."
— [Workflow syntax for GitHub Actions — concurrency](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency)

A concurrency group is occupied by at most one running item (plus, under the default `queue: single`, at most one pending item waiting behind it). Once the running item's workflow run reaches a **terminal** state — `completed` with conclusion `failure` (Reject), `cancelled` (manual cancel), or `success` — it is no longer "running," and the group is free. GitHub's docs don't need to say this separately for the Reject case specifically, because Reject → `workflow will fail` (documented above) already puts the run into the same terminal `completed` state that any other job failure would, and the concurrency rule about a free group applying to the *next queued run* is general, not conditioned on *why* the previous run finished. So: **yes** — a Reject fails the run, which is a terminal state, which frees the `deploy-production` concurrency group for the next queued run to start, on the same general concurrency-group-occupancy logic already confirmed for this investigation. This chained conclusion is not spelled out verbatim on a single GitHub page as "reject frees the group," so it is presented here as a direct composition of two independently documented facts rather than as a single directly-quoted claim — flagged in Open Questions below.

## Q2: Can a run parked on approval be manually cancelled, and by whom?

**Yes — cancellation is available via both the UI and `gh run cancel`,** and it does not require being a required reviewer.

**UI path.** GitHub's cancel-a-workflow-run doc gives the steps and the state it applies to:

> "You can cancel a workflow run, including all jobs and steps, that is in progress." ... "From the list of workflow runs, click the name of the `queued` or `in progress` run that you want to cancel. In the upper-right corner of the workflow, click **Cancel workflow**."
— [Canceling a workflow run](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/cancel-a-workflow-run)

Because a run whose job is in the `waiting`-for-approval status has already started (see Q1), it is in the `in progress` bucket this page describes as cancellable, not the `queued` bucket.

**Permission required for the UI path.** GitHub's docs (surfaced consistently across GitHub's own cancel-a-workflow-run page content) state that cancelling requires **write access to the repository** — this is a repository-role permission, separate from and broader than being one of the (at most six) named required reviewers on the `production` environment. Required reviewers themselves only need **read** access:

> "The reviewers must have at least read access to the repository. Only one of the required reviewers needs to approve the job for it to proceed."
— [Deployments and environments — Required reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers)

So the two permission surfaces are genuinely different: approving/rejecting is gated by the environment's required-reviewers list (read access suffices, but you must be on that specific list of up to six people/teams); cancelling a run outright is gated by ordinary repository **write** access and has nothing to do with the required-reviewers list — anyone with write access can cancel the run, whether or not they are a listed reviewer.

**`gh run cancel` path.** The CLI reference itself is terse:

> Usage: `gh run cancel [<run-id>] [flags]` — "Cancel a workflow run." Flags: `--force` (force cancel a workflow run), `-R/--repo`.
— [gh run cancel](https://cli.github.com/manual/gh_run_cancel)

The CLI manual page does not itself state a required permission level. `gh run cancel` calls the same underlying REST endpoint as the UI action:

> `POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel` — "Cancels a workflow run using its id." "OAuth tokens and personal access tokens (classic) need the `repo` scope to use this endpoint."
— [Cancel a workflow run — REST API](https://docs.github.com/en/rest/actions/workflow-runs#cancel-a-workflow-run)

The `repo` OAuth scope maps to needing write access to the repository for a classic token; this is consistent with (not contradicted by) the UI page's write-access requirement, so both paths (UI button, `gh run cancel`) appear to require the same underlying permission level — ordinary repo write access — not required-reviewer status. This alignment is an inference from combining the UI doc and the REST endpoint doc rather than one page stating both paths require identical permissions in so many words; flagged below.

**Does cancelling free the concurrency group the same way a reject does?** Cancelling drives the run to `completed` with conclusion `cancelled` — a terminal state, per the documented run/job status-and-conclusion enum (`cancelled` and `failure` are both listed as terminal `conclusion` values) — [Get a workflow run — REST API](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run). Concurrency-group occupancy, per the documentation quoted in Q1, is about whether a run in the group is still `running`/`pending` — it is not conditioned on *which* terminal conclusion a run reached. So cancelling frees the group exactly the same way rejecting does: both take the run out of the "running" slot into a terminal, no-longer-occupying state.

## Q3: Incident-response procedure

### Stopping a bad deploy before it reaches production

Scenario: a bad or malicious commit landed on `main`. Its `deploy.yml` run is somewhere in the `deploy-production` concurrency group — either still in `build-and-push` (or `deploy` queued/building), or parked with `deploy` in `Waiting` status on the required-reviewer gate. Goal: stop **that specific run**, without leaving the `deploy-production` concurrency group stuck so the next legitimate deploy can queue in and run normally.

**Case A — the run is still building / its `deploy` job hasn't reached the approval gate yet (status `queued` or `in_progress`, not yet `Waiting`).**

- **Action: Cancel**, not Reject (Reject only exists once the run has reached the approval prompt — there is nothing to reject yet).
- **UI**: Actions tab → select the workflow → open the specific run → click **Cancel workflow** in the upper-right corner.
- **CLI**: `gh run cancel <run-id>` (find `<run-id>` via `gh run list --workflow=deploy.yml`).
- **Why this is safe for the queue**: Cancelling drives the run to a terminal `completed`/`cancelled` state. Per the concurrency semantics established for this repo's `deploy-production` group (only one running + one pending item held at a time, and only the *older pending* run is auto-cancelled when a *newer* one is queued — the running item is left alone), a terminal run is no longer occupying the group's running slot, so the group becomes free and the next queued run (the legitimate deploy that should follow) starts normally per GitHub's FIFO concurrency-group processing.
- Permission needed: repo **write** access (same as any workflow-run cancellation) — [Canceling a workflow run](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/cancel-a-workflow-run), [Cancel a workflow run — REST API](https://docs.github.com/en/rest/actions/workflow-runs#cancel-a-workflow-run). No need to be a listed `production` required reviewer for this step.

**Case B — the run's `deploy` job is parked, status `Waiting`, sitting on the required-reviewer approval gate.**

- **Either action works and both free the group** — but they are not interchangeable in meaning, and one is clearly preferable:
  - **Reject** (if you are one of the up to six listed required reviewers on the `production` environment): Actions tab → open the run → on the pending-deployment banner click **Review deployments** → select the environment → click **Reject** (optionally leave a comment explaining why). This drives the run to `failure` — [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments). **This is the preferred action when you are a required reviewer**: it leaves an explicit, auditable "a human reviewed this deploy and refused it" record tied to the environment-protection feature itself, distinct from an unexplained cancellation, and it does not require write access beyond being a reviewer.
  - **Cancel** (if you have repo write access but are *not* one of the listed required reviewers, or you simply want the blunt stop): Actions tab → open the run → **Cancel workflow**, or `gh run cancel <run-id>`. This drives the run to `cancelled`, also terminal.
- **Why either is safe for the queue**: Both Reject and Cancel take the run out of the group's occupied "running" slot into a terminal state (`failure` or `cancelled` respectively — both documented terminal `conclusion` values). The `deploy-production` concurrency group does not care which terminal conclusion ended the occupying run, only that it is no longer running/pending. Once it's terminal, the next queued run — the legitimate deploy — is free to start.
- **Do not** wait for the 30-day approval timeout as a way to "clear" the run — besides being far too slow for an incident, letting it auto-fail is strictly worse than an explicit Reject/Cancel with no operational benefit, and leaves the bad run sitting in the group's running slot (blocking the legitimate deploy behind it) for the entire wait.

**In both cases:** because `cancel-in-progress: false` is set on this workflow and the default concurrency rule only auto-cancels an *older pending* run (never the currently running one), nothing you do here to the bad run's occupying slot has any automatic side effect on a different, unrelated run — you must take the explicit Cancel/Reject action yourself; GitHub will not do it for you just because a newer commit landed on `main` and queued up behind it.

## Open questions / gaps

- GitHub's docs never state, on a single page, in so many words, "rejecting/cancelling a run frees its concurrency group for the next queued run." This is a composition of two independently and precisely documented facts (Reject/Cancel → terminal run state; a concurrency group's occupancy is defined by running/pending status, not by which terminal conclusion ended the previous occupant) rather than one directly quotable sentence. Recommend a hands-on verification (trigger a deploy, let a second one queue behind it, Reject the first, confirm the second starts) before treating this as fully load-bearing for an incident runbook.
- GitHub's docs do not explicitly state that `gh run cancel`'s and the UI Cancel button's required permission level is identical to each other in a single sentence — this is inferred by both ultimately calling the same REST `cancel` endpoint (documented to need `repo` scope / write access) and the UI page separately documenting a write-access requirement. Worth a hands-on check with a read-only/required-reviewer-only account attempting `gh run cancel` against a run parked on approval, to confirm it is refused (as the write-access requirement implies) rather than silently permitted through some required-reviewer-specific carve-out that isn't documented.
- No GitHub primary source was found stating explicitly whether a run whose only non-completed job is in `Waiting` status is reported as run-level `status: in_progress` (as assumed here, consistent with the job having "started") versus some other run-level status. The REST API's documented status/conclusion enum lists `waiting` as a possible value in the same shared enum as `in_progress`, `queued`, etc., but doesn't spell out the run-level vs. job-level status relationship for this specific case. This is the same edge case the task's premise already treats as settled ("that counts as running, not pending, once its job has started") — this research did not find a GitHub page that states it more explicitly than that premise already does.

## Sources

- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers
- https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/cancel-a-workflow-run
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation
- https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- https://cli.github.com/manual/gh_run_cancel
- https://docs.github.com/en/rest/actions/workflow-runs#cancel-a-workflow-run
- https://docs.github.com/en/rest/actions/workflow-runs#review-pending-deployments-for-a-workflow-run
- https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
- https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run
