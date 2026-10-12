# Research: detecting non-latest dependencies added in a PR (npm, actions, images)

Source ticket: https://github.com/Bleupi/campus-internship/issues/220 (child of map #195; feeds #221). Related: PRD #194 (7-day Dependabot cooldown, SHA-pinned actions, digest-pinned images, zizmor), #127 (the policy: agents install the latest stable), #203 / `docs/research/0203-test-deletion-guard.md` on `research/test-deletion-guard` (pre-push hook and label/PR-body patterns, not repeated here), `.husky/pre-push`, `.github/workflows/*.yml`, `apps/*/Dockerfile`, `pnpm-workspace.yaml`.

State of the repo when this was written (2026-10-12): pnpm 11.5.1 (`packageManager`), 4 workspace importers with 79 direct dependencies, no `minimumReleaseAge` configured, actions on floating major tags (`actions/checkout@v7`), images on tags without digests (`postgres:16-alpine`, `cgr.dev/chainguard/minio:latest`, `node:24-alpine`, `nginx:1.27-alpine`). #194 will move actions to SHA + version comment and images to digests. "Measured" means run locally on this repo or in a scratch project with pnpm 11.5.1. Everything else cites its source.

## TL;DR

- **The rule has two halves, and they need different owners.**
  - _Too fresh_ (< 7 days old). pnpm already blocks this natively. Set `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`. The setting then becomes **strict**: `pnpm add pkg@<fresh>` fails, `pnpm add pkg` falls back to the newest mature version, and `pnpm install --frozen-lockfile` re-verifies **every lockfile entry, transitive included** (all measured). The repo's lockfile passes this today.
  - _Not latest_ (an older version than the newest mature one). No off-the-shelf tool checks only what a PR changed, so this needs a small in-repo script.
- **npm, no new dependency:**
  - `pnpm list -r --depth 0 --json --lockfile-only` gives base and head direct-dependency versions per importer (0.19 s).
  - `pnpm outdated -r --format json` gives `latest`, which **already honours `minimumReleaseAge`** (measured: `vite` reports 8.3.2, not the 4-day-old 8.3.4). That makes it exactly "latest stable ≥ 7 days". 2 s for the whole repo.
  - The script compares only the entries that the diff added or changed.
- **Actions:**
  - Parse `uses: owner/repo@<sha> # vX.Y.Z`.
  - zizmor's offline `ref-version-mismatch` audit already proves that the comment matches the SHA.
  - "Latest" is the highest-semver release that is not a draft or prerelease and has `published_at` ≤ now − 7 d, from `GET /repos/{o}/{r}/releases`. **Sort by semver, not by date**: `actions/checkout` published v4.4.0 _after_ v7.0.1.
- **Images:**
  - Tags are not releases, so "latest stable" across tags (node 26 vs the chosen LTS 24, postgres 18 vs the prod major 16) is a deliberate choice. Make it informative only.
  - The checkable part is the digest. Is the pinned digest the newest build of its tag that is ≥ 7 days old?
  - The build date comes from the OCI config's `created` field (registry API). Chainguard's free `latest` is rebuilt daily (current build created 2026-10-11), so its newest digest is almost never 7 days old.
- **Off-the-shelf:**
  - npm-check-updates has `--cooldown 7d` and reads `minimumReleaseAge` from `pnpm-workspace.yaml`, but it reports all upgradable deps, not the PR diff.
  - `pnpm outdated --include-github-actions` exists from pnpm **11.16**. The repo is on 11.5.1, and the docs don't say whether `minimumReleaseAge` applies to actions.
  - Renovate and Dependabot propose updates; they don't gate PRs.
  - A ~300-line zero-dependency Node script (Node 24 `fetch`) is the smallest safe option. tj-actions (CVE-2025-30066) is the reason not to pull in a third-party action for this.
- **Where it runs:**
  - One script, `--base <sha> --head <sha>`.
  - **CI is the blocking owner**: a PR-validation job, bypass via label + PR-body section read through `env:`.
  - **Pre-push is informative only**: it can't see the PR's label or body, and it fails open offline.
- **Effort:** about 2.5 days. Script + fixtures/tests 1.5 d, CI job + bypass 0.5 d, pre-push + `minimumReleaseAge` config + docs 0.5 d.

---

## 1. What "changed in the PR" means, per ecosystem

| Ecosystem | Source of truth | Base vs head | Measured / note |
| --- | --- | --- | --- |
| npm | `pnpm-lock.yaml` `importers` (resolved version per workspace package) | `pnpm list -r --depth 0 --json --lockfile-only` on head. On base, run it on a `git archive <base> pnpm-lock.yaml pnpm-workspace.yaml package.json apps/*/package.json packages/*/package.json` extracted to a temp dir | 0.19 s. Each entry has `version` + `from`. Keyed by importer, so "added to `apps/web`" ≠ "already in `apps/api`". `overrides` in `pnpm-workspace.yaml` also change resolution; diff that block textually |
| Actions | `.github/workflows/*.yml` `uses:` lines | `git diff --unified=0 <base>...<head> -- .github/workflows` and keep `+` lines matching `uses:` | Skip local `./` actions and `docker://` refs (the latter go through the image path) |
| Images | `FROM` in `apps/*/Dockerfile`, `image:` under `services:` in workflows | Same `git diff` filter on `FROM` / `image:` lines | Parse `name[:tag][@sha256:…]`. A `FROM base AS x` stage alias is not an image |

Use the merge-base as the base, not the base branch tip: `git merge-base origin/main HEAD`. In CI that means `actions/checkout` with `fetch-depth: 0`, or a fetch of `github.event.pull_request.base.sha`. The pre-push hook gets per-ref ranges on stdin ([githooks](https://git-scm.com/docs/githooks#_pre_push)). #203's note covers the parsing.

## 2. Computing "latest stable published ≥ 7 days ago"

### 2.1 npm

**Registry primitives** ([package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)):

- The full packument's `time` is "an object mapping versions to the time published, along with `created` and `modified` timestamps".
- `dist-tags`: "Every package will have a `latest` tag defined."
- The **abbreviated** (`application/vnd.npm.install-v1+json`) document has `modified` but **no `time`**, so age checks need the full document. Full documents are large. Measured: `vite` 38 MB / 1.3 s, `@types/node` 11 MB, `@nestjs/core` 1 MB / 54 ms.

**Algorithm.** A prototype was run against the registry:

1. Keep versions matching `^\d+\.\d+\.\d+$` (this excludes prereleases).
2. Drop deprecated versions.
3. Keep versions with `time[v] ≤ now − 7 d` and `v ≤ dist-tags.latest`.
4. Take the semver max.

Results on 2026-10-12:

| Package        | `latest` dist-tag | Published  | Latest ≥ 7 d |
| -------------- | ----------------- | ---------- | ------------ |
| `zod`          | 4.6.6             | 2026-10-11 | 4.6.5        |
| `vite`         | 8.3.4             | 2026-10-08 | 8.3.2        |
| `@nestjs/core` | 12.1.3            | today      | 12.1.2       |
| `typescript`   | 7.0.2             | July       | 7.0.2        |

Capping at `dist-tags.latest` respects maintainers who publish a higher major under another tag, e.g. pnpm's `next-12`.

**Shortcut: let pnpm do it.** `pnpm outdated -r --format json --config.minimum-release-age=10080` (measured, 2 s, exit 1 when anything is outdated) returns, per package name, `{ current, latest, wanted, isDeprecated, dependencyType, dependentPackages[] }`.

- `latest` already excludes too-fresh versions. In a scratch project with `zod@4.6.4`, `latest` was 4.6.6 with age 0 and 4.6.5 with the default age and with 10080.
- Up-to-date packages are omitted.
- The pnpm docs don't document this interaction, so it is measured only ([pnpm outdated](https://pnpm.io/cli/outdated)). Add a script test that pins it.
- The script should take `current` from the lockfile listing, not from `outdated`. That way the check reflects the pushed lockfile rather than a possibly stale local `node_modules`.

### 2.2 pnpm `minimumReleaseAge` (pnpm 11)

**Settings** ([dependency-resolution settings](https://pnpm.io/settings/dependency-resolution)):

- `minimumReleaseAge`: minutes. Added in v10.16.0. **Default 1440 since v11**, 0 before. It "defines the minimum number of minutes that must pass after a version is published before pnpm will install it". It applies to transitive dependencies too.
- `minimumReleaseAgeStrict`: added in v11.0.0. Defaults to `true` **if `minimumReleaseAge` is explicitly configured**, `false` otherwise. "The built-in 1440 default is non-strict for backward compatibility."
- Non-strict mode falls back to a version that doesn't meet the age.
- `minimumReleaseAgeExclude`: package names, patterns, or exact `name@version` exemptions.
- `minimumReleaseAgeIgnoreMissingTime`: default `true`.

[Supply-chain security](https://pnpm.io/supply-chain-security) suggests `10080` for a one-week wait.

**Measured on pnpm 11.5.1, scratch project:**

- **Explicit `minimumReleaseAge: 10080`:**
  - `pnpm add zod` installs **4.6.5** ("4.6.6 is available"). It falls back; it does not fail.
  - `pnpm add zod@4.6.6` fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.
  - `pnpm install --frozen-lockfile` against a lockfile that contains 4.6.6 fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`: "The lockfile contains entries that the active policies reject … someone committed a lockfile that bypassed the policy locally". The CLI flag `--config.minimum-release-age=10080` triggers the same verification.
- **Default config (non-strict 1440):** `pnpm add zod@4.6.6` (19 h old) **succeeds and silently appends `minimumReleaseAgeExclude: [zod@4.6.6]` to `pnpm-workspace.yaml`** ("set minimumReleaseAgeStrict to true to gate these updates with a prompt"). That edit shows up in the diff, so the script should flag any change to `minimumReleaseAgeExclude` as an exception that needs justification.
- **This repo:** `pnpm install --frozen-lockfile --config.minimum-release-age=10080` passes today (15 s). No lockfile entry, transitive included, is younger than 7 days.

**Interaction with "latest":** `pnpm add <pkg>` with no version, which is what #127 tells agents to do, resolves to the newest _mature_ version. So with the setting on, the agent's default path produces exactly what the check expects.

**Gap and risk:**

- The setting never complains about an **old** version, so the script is still needed.
- **Dependabot security updates** are not delayed by Dependabot's own `cooldown` ("only available for _version_ updates, not _security_ updates", [Dependabot options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)). A security fix younger than 7 days would then fail CI's frozen install. Each such fix needs a `minimumReleaseAgeExclude: [pkg@ver]` entry in the same PR.
- Not verified: whether Dependabot's updater itself honours the setting when it resolves.

### 2.3 GitHub Actions

**Pin format** (from #194): `uses: owner/repo@<40-hex> # vX.Y.Z`.

**Comment ↔ SHA consistency is zizmor's job.** `ref-version-mismatch` (v1.14.0, offline) "Detects `uses:` clauses where a hash-pinned action's version comment … is mismatched". The related `impostor-commit` and `stale-action-refs` audits need the network ([zizmor audits](https://docs.zizmor.sh/audits/)). The script can therefore trust the comment and not re-resolve the SHA. If it ever must, `git ls-remote --tags https://github.com/o/r` gives the `^{}`-peeled SHA of annotated tags with no API quota.

**Finding "latest" (releases):**

- `GET /repos/{o}/{r}/releases/latest` is "the most recent non-prerelease, non-draft release, sorted by the `created_at` attribute". `created_at` is "the date of the commit used for the release", not the publish date ([Releases API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)).
- That is neither semver-max nor publish-age, so use `GET /repos/{o}/{r}/releases?per_page=100`:
  1. Filter `!draft && !prerelease && published_at ≤ now − 7 d`.
  2. Parse `tag_name` as `vX.Y.Z`.
  3. Take the semver max.
- Measured: `actions/checkout` lists v7.0.1, then v6.1.0, v5.1.0 and v4.4.0, all published 2026-07-20 within 26 minutes. Backports make date order wrong.
- Measured: `pnpm/setup` v3.1.1 is 2 days old, so today's mature latest is v3.0.0. The repo is on `@v2`.

**Fallback (tags only):** an action with tags but no releases. "List releases" "does not include regular Git tags that have not been associated with a release." Fall back to `GET /repos/{o}/{r}/tags`. Tags carry no date, so get one from the tagged commit (`GET /repos/{o}/{r}/commits/{sha}` → `commit.committer.date`). `scaleway/action-scw` has both releases and tags (v0.0.3, with `v0` pointing at the same SHA).

**Quota:** `GITHUB_TOKEN` gets 1,000 requests/hour per repository ([REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). That is ample for 1–2 calls per changed action. Locally, `gh api` uses the owner's token.

**Off-the-shelf:** `pnpm update`/`outdated --include-github-actions` (pnpm ≥ 11.16.0) scans workflow files with `git ls-remote` and pins "to exact commit hashes, with their release tags preserved in comments" ([pnpm update](https://pnpm.io/cli/update)). The docs don't say whether it ignores prereleases or applies `minimumReleaseAge`, and it needs a pnpm bump (#128). Worth re-checking once pnpm is upgraded. Not the basis today.

### 2.4 Docker images

**Tag listing:**

- Docker Hub: `GET https://hub.docker.com/v2/namespaces/{ns}/repositories/{repo}/tags?page_size=100[&name=…]` returns `name`, `digest`, `last_updated`, `tag_last_pushed`.
  - Measured: `postgres:16-alpine` → `sha256:7218…` pushed 2026-09-21.
  - `name=` is a substring filter.
  - `node` has 9,170 tags.
- The generic OCI distribution API (`GET /v2/<name>/tags/list`) returns names only.
  - Measured on `cgr.dev/chainguard/minio`: only `latest`, `latest-dev` and `sha256-….sig/.att` signature tags. The free Chainguard tier exposes only the latest build ([Chainguard directory](https://images.chainguard.dev/directory/image/minio/versions)).

**Build date of a digest** (works on any registry):

1. Anonymous token.
2. `GET /v2/<name>/manifests/<ref>`: the index. The digest is in the `docker-content-digest` header.
3. Pick the `linux/amd64` manifest.
4. `GET /v2/<name>/blobs/<config digest>` → `created`.

Measured:

- `postgres:16-alpine` created 2026-09-17
- `node:24-alpine` created 2026-09-17
- `cgr.dev/chainguard/minio:latest` created **2026-10-11**. It is rebuilt daily.

**Docker Hub quota:** "Using GET emulates a real pull and counts towards the limit. Using HEAD won't." Anonymous users get 100 pulls per IPv4 address per 6 h ([Docker Hub pulls](https://docs.docker.com/docker-hub/usage/pulls/)). Use `HEAD` for the current digest and GET only for the changed images.

**What "latest stable" can mean for an image:**

- **Tag line:** `node:24-alpine` vs `26.x`, `postgres:16` vs a newer major. These are product decisions (Node LTS, prod DB major). Report "a newer major tag exists" as **information**, never as a gate.
- **Digest:** the gateable part. _Pass_ if the pinned digest is the tag's current digest, or if the pinned digest's `created` ≥ now − 7 d and the tag's current digest is younger than 7 days (still cooling). _Fail_ if the tag's current digest is itself ≥ 7 days old and differs from the pin, meaning the PR added a stale pin.
- Registries keep no tag → digest history, so "the newest digest that is ≥ 7 days old" is unknowable once the tag moves twice inside a week. For Chainguard's daily rebuilds this will usually land in the "cooling" branch and pass.
- Dependabot's `docker` ecosystem with `cooldown.default-days: 7` (semver-*-days unsupported for Docker and Actions, [Dependabot options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)) remains the thing that _proposes_ new digests.

## 3. Off-the-shelf tools vs an in-repo script

| Option | Covers | Gap |
| --- | --- | --- |
| pnpm `minimumReleaseAge` (built in, strict when set) | npm too-fresh, transitive included, at install time and in CI's frozen install | Never flags old versions; npm only |
| `pnpm outdated -r --format json` | npm latest-mature per direct dep (honours the age, measured) | Whole repo, not the PR diff; exit 1 whenever anything is outdated (50 of 79 deps today, e.g. `typescript` 5.9.3 vs 7.0.2, `zod` 3.25.76 vs 4.6.5) |
| npm-check-updates `--cooldown 7d` ([README](https://github.com/raineorshine/npm-check-updates)) | Same as above; reads `minimumReleaseAge`/`Exclude` from `pnpm-workspace.yaml`; `--target @latest` skips rather than falls back | A new dependency adds supply-chain surface; still whole-repo; pnpm catalogs not documented |
| `pnpm outdated --include-github-actions` (≥ 11.16) | Actions | Needs a pnpm upgrade; prerelease/age semantics undocumented |
| Renovate / Dependabot | Propose updates with cooldown | They don't gate an arbitrary PR |
| zizmor | Comment ↔ SHA (`ref-version-mismatch`), unpinned uses/images, impostor commits | Never asks "is this the newest" |
| **In-repo script** | All three ecosystems, PR diff only, bypass-aware | About 300 lines to own and test |

**Why not a marketplace action:** in tj-actions/changed-files (CVE-2025-30066, 2025-03-14/15), "attackers retroactively modified multiple version tags to reference a malicious commit" that dumped runner secrets into logs, affecting 23,000+ repos ([GHSA-mrrh-fwg8-r2c3](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3)). A freshness checker needs a token and runs on every PR, so it should be code reviewed in this repo.

**The script needs no new dependency:**

- Node 24 `fetch`
- `pnpm list` / `pnpm outdated` for npm
- `gh api` locally, or `fetch` with `GITHUB_TOKEN` in CI, for actions
- registry HTTP for images
- a 10-line numeric semver compare, which is enough because prereleases are excluded

Two scratch prototypes for the npm and image paths ran in under 1.5 s per package.

## 4. Running it in CI and in the pre-push hook

**Script shape:**

- `node scripts/check-dependency-freshness.mjs --base <sha> --head <sha> [--format text|json|markdown] [--allow <list>]`
- Exit 0 when all is fresh or justified, 1 on findings, 2 on infrastructure error.
- Findings are tagged `npm:<importer>:<name>`, `action:<owner/repo>`, `image:<name>`.

**CI (blocking owner, informative first):**

- A separate job in `pr-validation.yml`, or its own small workflow, with `on: pull_request: types: [opened, synchronize, reopened, labeled, unlabeled, edited]`. These types are needed so that adding the label or editing the body re-runs it. See #203 §1.3 and [events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- Steps:
  1. `actions/checkout` (SHA-pinned, `persist-credentials: false`, `fetch-depth: 0`).
  2. pnpm setup.
  3. `pnpm install --frozen-lockfile`. With `minimumReleaseAge: 10080` this is already the too-fresh gate.
  4. Run the script.
- **Informative phase:** `continue-on-error: true` on the step, plus a `$GITHUB_STEP_SUMMARY` table. **Blocking phase:** remove it and mark the check required.
- Per map #195's pitfall, never filter the trigger by path. Exit 0 early inside the job when the diff touches no lockfile, workflow or Dockerfile.

**Bypass (zizmor-safe):**

- Label: `if:`/env `HAS_EXCEPTION: ${{ contains(github.event.pull_request.labels.*.name, 'dependency-exception') }}`.
- Body: `env: PR_BODY: ${{ github.event.pull_request.body }}`, read as `"$PR_BODY"` in shell, or `process.env.PR_BODY` in the script. Never `${{ … }}` inside `run:`; zizmor `template-injection` prefers env vars and warns that `${{ env.X }}` "is still a template expansion" ([zizmor audits](https://docs.zizmor.sh/audits/)).
- Require a `## Dependency exceptions` section that **names every flagged item**, so the script cross-checks names. This beats "label + any text".
- Trigger: `pull_request`, never `pull_request_target`.
- Permissions: `contents: read`.
- `GH_TOKEN: ${{ github.token }}` for the Releases API.

**Pre-push (informative only):**

- Add one line to `.husky/pre-push` that runs the script over each pushed ref's range, using the stdin parsing from #203.
- It **warns and exits 0**:
  - The PR label and body don't exist at push time.
  - The map's principle is "one blocking owner per concern", and CI owns this one.
- Wrap it in a wall-clock cap. On network failure, print a warning and continue (fail open), like #203's agent check.
- Cost: under ~2 s when no dependency file changed (diff only), a few seconds otherwise.
- The _too-fresh_ half is already enforced locally by pnpm itself once `minimumReleaseAge` is set. An agent following #127 (`pnpm add <pkg>`) lands on the mature latest version automatically.

## 5. Recommendation

1. **Set `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`** (strict by virtue of being explicit). That covers the too-fresh half for npm everywhere, transitive included, and the lockfile already passes. Document the security-update exception path (`minimumReleaseAgeExclude: pkg@ver`, justified in the PR body). This aligns with Dependabot's 7-day cooldown from #194. It probably belongs in the #127 policy ADR.
2. **Write `scripts/check-dependency-freshness.mjs`**, zero dependencies:
   - npm: lockfile-listing diff + `pnpm outdated` `latest`, plus any change to `overrides`/`minimumReleaseAgeExclude`.
   - Actions: Releases API, semver max of mature non-prereleases; zizmor guards the comment.
   - Images: digest age vs the tag's current digest; a newer major is information only.
   - Unit-test it with recorded registry/API fixtures, the same way #201's CRAP script is planned.
3. **CI job** with label + named PR-body section via `env:`, informative first, then a dedicated ticket flips it to required. **Pre-push** runs the same script, warning only.

**Open for #221:**

- Should a _version-changed_ dependency (e.g. a Dependabot minor-group bump when a newer major exists) be held to "absolute latest", or to "latest within its current major"? With absolute latest, every Dependabot minor/patch group PR fails while a major is pending. Suggestion: added → absolute latest; changed → latest mature in the same major, with the newer major reported as information.
- Label name.

**Effort:** about 2.5 days.

| Task                                                 | Estimate |
| ---------------------------------------------------- | -------- |
| Script + tests                                       | 1.5 d    |
| CI job, bypass, summary                              | 0.5 d    |
| `minimumReleaseAge` + exception docs + pre-push line | 0.5 d    |

The image half is the least certain part, because Scaleway/registry behaviour and the lack of digest history may need a simplification.
