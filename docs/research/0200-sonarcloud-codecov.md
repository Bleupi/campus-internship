# Research: SonarQube Cloud (and Codecov) for this public monorepo

Source ticket: https://github.com/Bleupi/campus-internship/issues/200 (map #195)
Related: docs/adr/0022-cicd-scaleway-deployment.md, .github/workflows/pr-validation.yml, PRD #194 (SHA-pinned actions, actionlint + zizmor)
Sources read on 2026-10-12. Vendor pricing pages change often, so re-check them before writing the ADR.

## TL;DR

- **SonarQube Cloud Free** covers this repo: public projects are **unlimited and free**. The 50k LOC cap applies only to private projects. Free allows 5 org members, analyzes **only the main branch**, and analyzes **PRs only when they target main**, which matches our flow. It has **no custom quality gates or quality profiles**, so we get the built-in read-only "Sonar way" gate (80% coverage on new code, plus 3% max duplication, A ratings, and hotspots reviewed).
- **Coverage import requires CI-based analysis.** Automatic analysis supports neither coverage, nor external (ESLint) reports, nor monorepos. Use `SonarSource/sonarqube-scan-action` (the `sonarcloud-github-action` repo is archived/deprecated). Latest is `v8.3.0` = `d209202bc7d53ff1cc128f7f907dac145c9d6ae9`.
- **Monorepo lcov**: one Sonar project for the whole repo. `sonar.javascript.lcov.reportPaths` accepts a comma-separated list and wildcards. The `SF:` paths must be unique repo-wide, so they need to be root-relative.
- **No CRAP metric.** Sonar exposes cyclomatic and cognitive complexity and coverage per file. It does not combine them, so CRAP stays a separate tool.
- **Codecov adds little.** It is free for public repos, but its free-tier flags/components for OSS are ambiguous on the pricing page. Its patch status duplicates Sonar's new-code coverage condition. Its one real extra is a configurable `target: auto` **project ratchet** status. We can get that ratchet ourselves from Jest/Vitest thresholds or a small script. Recommendation: **skip Codecov** unless the ratchet design (map #195) wants a hosted ratchet.

## 1. Free plan for a public repo

Subscription plans doc (https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans/), Free column:

| Row | Free |
|---|---|
| Analysis of public projects | ✓, "unlimited number of projects" |
| Analysis of private projects | Up to 50k LOC |
| Max organization members | 5 |
| Branch analysis | "Only main branch analysis" |
| Pull request analysis | "Only if the target branch is the main branch" |
| Custom quality profiles / custom quality gates | not included (Team/Enterprise only) |
| Architecture | not included |
| Report of security alerts in GitHub | not included |
| SCA, Advanced SAST, AI CodeFix | not included |
| Slack, cloud-hosted MCP server, AI Code Assurance | ✓ |

The pricing page (https://www.sonarsource.com/plans-and-pricing/sonarcloud/) adds that only private projects count toward LOC. For a project with branches, only its largest branch counts. "Free tier never expires." The paid Team plan starts around $32–34/month; the page contradicts itself on the exact figure.

Implications for us:
- PRs target `main` (CONTRIBUTING.md), so PR analysis works on Free.
- **We cannot edit the gate.** The built-in "Sonar way" is read-only (quality-gates doc below). "Start informative, flip to blocking later" (map #195) therefore has to happen **on the GitHub side**: whether the Sonar check is listed as a required status check in branch protection. It cannot happen by loosening the gate.
- "Architecture" (Sonar's architecture visualization) is paid, so it does not cover map #195's visual architecture report.
- "Report of security alerts in GitHub" is paid, so Sonar findings will not land in the GitHub Security tab. CodeQL would.

## 2. Automatic vs CI-based analysis

Automatic analysis doc (https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/automatic-analysis/) lists these limitations:
> "Code coverage information is not supported."
> "Import of external rule engine reports is not supported."

Branch analysis (beyond main and PRs) and **monorepo projects** are also listed as unsupported, and automatic analysis logs are unavailable.

The coverage doc says the same: "coverage is not yet supported under automatic analysis". To switch an existing project to CI-based analysis, turn automatic analysis off under **Administration > Analysis Method**. For a new project, add a `sonar-project.properties` first (https://docs.sonarsource.com/sonarqube-cloud/enriching/test-coverage/javascript-typescript-test-coverage/).

**So we need CI-based analysis.** Coverage is the whole point of this ticket.

## 3. Importing several lcov reports from the pnpm monorepo

From the JS/TS coverage doc (same URL as above):
- `sonar.javascript.lcov.reportPaths` covers both JS and TS (`sonar.typescript.lcov.reportPaths` is deprecated).
- "Wildcards and a comma-delimited list of paths are supported."
- Monorepo warning: when a monorepo is one project with per-workspace reports, "the file paths inside each report must be unique across the whole repository". Otherwise some files may wrongly show 0%. The suggested fix is to run coverage from the repo root so `SF:` paths include the workspace folder (e.g. `apps/api/src/...`).

Sketch (not yet validated):
```
sonar.organization=<org>
sonar.projectKey=<key>
sonar.sources=apps/api/src,apps/web/src,packages/shared/src
sonar.tests=apps/api/src,apps/api/test,apps/web/src,packages/shared/src
sonar.test.inclusions=**/*.spec.ts,**/*.e2e-spec.ts,**/*.test.ts,**/*.test.tsx
sonar.exclusions=**/*.spec-helpers.ts
sonar.javascript.lcov.reportPaths=apps/api/coverage/lcov.info,apps/web/coverage/lcov.info,packages/shared/coverage/lcov.info
sonar.typescript.tsconfigPaths=apps/api/tsconfig.json,apps/web/tsconfig.json,packages/shared/tsconfig.json
```

Current state of the repo:
- `apps/api` Jest has `collectCoverageFrom` and `coverageDirectory: "../coverage"` (rootDir is `src`).
- `apps/web` and `packages/shared` have no Vitest coverage config yet (`@vitest/coverage-v8` plus the `lcov` reporter are needed).
- **Verify the `SF:` paths each tool writes.** Jest's paths come from `rootDir=src`. Normalize them to root-relative (Vitest `coverage.root`/`allowExternal`, or a `sed` on `SF:` lines) so the uniqueness rule holds.

The JS/TS language doc (https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/languages/javascript-typescript-css/) recommends listing `sonar.typescript.tsconfigPaths` explicitly for monorepos, because otherwise the scanner searches the filesystem, which is slow. The scanner ships an embedded Node on Linux x64, so no setup is needed on `ubuntu-latest`.

Whether to analyze e2e coverage too is a design choice. Unit coverage alone is the simplest start.

## 4. PR decoration, quality gate, new code

Quality gates doc (https://docs.sonarsource.com/sonarqube-cloud/standards/managing-quality-gates/introduction-to-quality-gates/). The **Sonar way** conditions are:
- No new bugs (Reliability A), no new vulnerabilities (Security A), Maintainability A on new code
- All new Security Hotspots reviewed
- **New code coverage ≥ 80.0%**
- **New code duplication ≤ 3.0%**

On small changes: coverage and duplication conditions are "ignored until the number of new lines is at least 20". This is on by default and the project admin can override it. Custom gates are Team/Enterprise only, so on Free we live with these exact numbers. The doc does not use the term "Clean as You Code" any more. It describes the same idea: the gate "focuses on keeping high quality standards for new code".

**New code definition** (https://docs.sonarsource.com/sonarqube-cloud/standards/about-new-code/) applies to the main branch:
- "Previous version": changes since the last `sonar.projectVersion` bump. We could feed this from changesets' package version.
- "Number of days": default 30, max 90.
- "Specific version/date" can be set through the Web API only.
- "By default, no organization-level new code definition is set."

**In a PR, new code is the PR diff** (https://docs.sonarsource.com/sonarqube-cloud/improving/pull-request-analysis/). Analysis compares the PR head with the latest scan of the target branch. It "only reports issues that were introduced by the pull request itself", and "only the conditions on new code within the quality gate are applied". The gate result and a summary comment are posted to GitHub, and the doc says it can "block the merge of the pull request if the quality gate fails". In practice that blocking comes from making the check required in branch protection.

## 5. Overlaps

**ESLint.**
- Sonar's JS/TS analyzer "includes a selection of rules from ESLint and some of its plugins" (language doc above).
- ESLint JSON reports can be imported through `sonar.eslint.reportPaths` (CI-based only) (https://docs.sonarsource.com/sonarqube-cloud/enriching/external-analyzer-reports/).
- Imported issues "can be taken into account when calculating quality gate status". They are resolvable in Sonar, but that state does not sync back to ESLint, and external rules are not configurable in quality profiles.
- On duplicates: "if you import issues for rules that we already raised in our analysis, issues won't be duplicated."
- Under "one blocking owner per concern", ESLint already blocks in `pnpm lint`, so **don't import ESLint reports**. Importing would let ESLint findings count twice toward gating (once in lint, once in Sonar's gate).
- Sonar's own rules (bugs, code smells, cognitive complexity, duplication) are a different, broader rule set than our ESLint config. Expect some overlap and resolve it as "won't fix" in Sonar.

**CodeQL.**
- Sonar Free runs its standard security rules and hotspots. The security rules doc mentions taint analysis for injection (https://docs.sonarsource.com/sonarqube-cloud/digging-deeper/security-related-rules/), but "Advanced SAST" (deeper/cross-dependency) is paid. The docs do not say plainly which taint rules run on Free.
- "Report of security alerts in GitHub" is paid, so Sonar security findings stay in Sonar's UI.
- CodeQL (free for public repos) reports into GitHub code scanning.
- If we adopt both, make **CodeQL the owner of security** (blocking via code scanning). Sonar's security conditions still sit inside its read-only gate, so while the Sonar check is required both would block on vulnerabilities. That is acceptable only if we accept the double gate, or keep Sonar informative. This is for the tool matrix to settle.

**Jest/Vitest coverage thresholds.**
- Sonar's 80% new-code coverage condition and a local ratchet measure different things. Sonar checks the diff; a ratchet checks that the global total doesn't drop.
- Per "one blocking owner per concern", one natural split:
  - Sonar owns **new-code coverage**.
  - Jest `coverageThreshold` and Vitest `coverage.thresholds` own the **global ratchet floor**. They run locally too, which keeps them deterministic and offline.
- The two are complementary, not duplicates.

## 6. Anything CRAP-like?

No. The metric definitions doc (https://docs.sonarsource.com/sonarqube-cloud/digging-deeper/metric-definitions/) lists `complexity` (cyclomatic), `cognitive_complexity`, `coverage`, `new_coverage`, `uncovered_lines`, `branch_coverage`, and `uncovered_conditions` as separate metrics. None combines complexity and coverage. Sonar has a rule on cognitive complexity per function, but CRAP (complexity² × (1 − cov)³ + complexity) has to be computed elsewhere: a small script over lcov plus a complexity source, or a dedicated tool. The per-file metrics are available from the Sonar Web API if we want to reuse them.

## 7. GitHub Action

- Official: **`SonarSource/sonarqube-scan-action`** (https://github.com/SonarSource/sonarqube-scan-action). Its README placeholder is `@<action version or sha1>`, so SHA pinning is supported.
- Latest release is `v8.3.0` (2026-09-30), commit `d209202bc7d53ff1cc128f7f907dac145c9d6ae9`, resolved via `gh api repos/SonarSource/sonarqube-scan-action/commits/v8.3.0`.
- `SonarSource/sonarcloud-github-action` is **archived**, with the description "Deprecated. Use https://github.com/SonarSource/sonarqube-scan-action instead."
- Requirements:
  - `actions/checkout` with `fetch-depth: 0` (blame data for new-code detection)
  - `SONAR_TOKEN` secret (no `SONAR_HOST_URL` for Cloud)
  - `sonar-project.properties` at the root
  - optional `projectBaseDir`
- Since v6, `args` quoting is restricted to prevent command injection. That is relevant to zizmor (PRD #194).
- **Fork PRs**: secrets are not exposed to `pull_request` runs from forks, so the scan cannot run there. It is a solo repo, so this is low impact, but the skip must happen inside the job (map #195 pitfall about required checks staying pending).

## 8. Codecov

- **Free tier** (https://about.codecov.io/pricing/): the Developer plan "is best for open-source projects and offers unlimited uploads"; public uploads are unlimited, private uploads are capped at 250/month. The free tier includes PR comments, status checks, and patch coverage. **Flags, components and carryforward flags are ambiguous for OSS on the pricing table.** Third-party summaries contradict each other, so confirm before relying on them.
- **Tokens** (https://docs.codecov.com/docs/codecov-tokens): public repos can upload tokenless from unprotected branches. Fork PRs are handled by codecov-action ≥ v4. A token is required for protected branches (i.e. `main`) unless the org disables token auth.
- **Statuses** (https://docs.codecov.com/docs/commit-status):
  - `codecov/project` compares overall coverage against the PR base, with `target: auto` and an optional `threshold` drop allowance. This is a hosted **ratchet**.
  - `codecov/patch` "only measures lines adjusted in the pull request". This is the same signal as Sonar's new-code coverage.
  - `informational: true` makes either status always pass.
- **Monorepo** (https://docs.codecov.com/docs/components): components group by path in `codecov.yml`, with no upload-time changes and their own project/patch statuses. Flags need one upload per flag. Codecov recommends components for new projects.
- **Action**: `codecov/codecov-action`, latest `v7.1.1` (2026-09-17).

**Does Codecov add anything Sonar doesn't?**
- Patch coverage and PR comments: no. Sonar already does both.
- Per-package (api/web/shared) coverage statuses: yes, via components, but free-tier availability is unclear.
- Hosted project ratchet (`target: auto`): yes. But the agreed design is "ratchet + new-code coverage", and the ratchet can be owned deterministically in-repo (threshold files bumped by a script or checked against `main`'s value). That keeps it local-runnable and avoids a second vendor and a second token.

**Recommendation:** don't adopt Codecov now. Revisit only if the in-repo ratchet turns out too fiddly or we want per-package PR comments.

## Open questions for the decision ticket (#205)

1. Confirm Codecov free-tier flags/components for OSS (moot if we skip Codecov).
2. Verify `SF:` path shapes from Jest (`rootDir: src`) and Vitest, and pick a normalization.
3. Unit-only coverage, or also merge e2e coverage?
4. New-code definition on `main`: "Previous version" (changesets version → `sonar.projectVersion`) vs "Number of days".
5. CodeQL vs Sonar security ownership, given that Sonar's gate is read-only on Free.
