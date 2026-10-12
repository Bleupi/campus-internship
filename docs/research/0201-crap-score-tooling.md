# Research: free CRAP-score tooling for this TypeScript monorepo

Source ticket: https://github.com/Bleupi/campus-internship/issues/201 (map #195) Related: `apps/api/package.json` (Jest config), `apps/web/vite.config.ts`, `packages/shared/package.json`, `pnpm-workspace.yaml` (overrides), `eslint.config.js`

CRAP per function = `comp² × (1 − cov)³ + comp`, `comp` = cyclomatic complexity, `cov` = coverage fraction. Usual threshold: 30 ([crap-score README](https://github.com/ahilke/js-crap-score#what-is-crap)).

## TL;DR

- **No hosted service computes CRAP for TS for free.** SonarQube Cloud has complexity and coverage metrics but no CRAP, and does not accept custom plugins. It can **display** CRAP findings as imported external issues.
- **Three npm tools exist; none is a safe dependency here.** `crap-score` is the most adopted, but it bundles ESLint 8 + NestJS 10 as runtime deps and was dormant from 2023 to 2026. `crap4ts` has the best CI features (PR comment, changed-only, artifact), but its 1.x is in maintenance mode, it is GPL-3.0, and it has 1 star. The rest are toys.
- **A ~100-line in-repo script is feasible and de-risked.** A throwaway PoC (below) joined real coverage with ESLint's `complexity` rule: **205/205 functions** in `apps/api` (Jest/istanbul) and **19/19** in `packages/shared` (Vitest/v8), in under a second.
- **Recommendation: an in-repo script.** It takes the repo's own ESLint 9 + `typescript-eslint` for complexity and `coverage-final.json` for coverage, and writes a job summary + JSON artifact. Optionally it also writes a Sonar external-issues file. Informative first, as #195 agreed. Effort is about 1 to 1.5 days including tests.

## 1. Existing tools

Data pulled from the npm registry (`npm view`, `api.npmjs.org/downloads`, last month ending 2026-10-10) and GitHub on 2026-10-12.

| Tool | Version / last publish | Downloads/month | Stars | License | How it works | Verdict |
| --- | --- | --: | --: | --- | --- | --- |
| [`crap-score`](https://github.com/ahilke/js-crap-score) | 1.2.1, 2026-04-24 (previous: 1.2.0, 2023-05-20) | 15,741 | 16 | MIT | Jest reporter, CLI or API over an istanbul `coverage-final.json`. Complexity comes from ESLint's `complexity` rule through its own ESLint instance. HTML + JSON report | Most adopted. But its **runtime** deps are `eslint ^8`, `@typescript-eslint/* ^7`, `@nestjs/core ^10`, `nest-commander`, `handlebars`. That is a second, older ESLint/Nest stack next to ours (ESLint 9.39, typescript-eslint 8.67, Nest 11). The 2026 release only changed publishing (commits: "bump node version", "setup trusted publishing"). No PR-comment or summary output |
| [`crap4ts`](https://github.com/breezy-bays-labs/crap4ts) | 1.0.1, 2026-06-24 | 7,323 | 1 | **GPL-3.0-or-later** | CLI over `coverage-final.json` / `coverage-v8.json`, uses `@typescript-eslint/typescript-estree` for complexity. Ships a GitHub Action with `threshold`, `changed-only`, `post-comment`, `upload-artifact`, `working-directory` | Best features on paper. But the README says: _"`crap4ts@1.x` is in maintenance mode … `crap4ts@2` is being rebuilt as a thin Rust-backed adapter"_. Single maintainer, the Action defaults to `version: latest` via npx (not pinnable the way PRD #194 requires), and the license is GPL |
| [`crap4js`](https://github.com/testudoq-org/crap4js) | 1.0.1-beta.7 | 240 | 1 | CC-BY-NC-4.0 | Babel parser | Beta, non-commercial license. No |
| [`ts-crap`](https://github.com/dedalik/ts-crap) | 1.0.0, 2026-05-28 (only release) | 44 | 1 | MIT | typescript-estree | One-shot release. No |
| [crapkit](https://pypi.org/project/crapkit/) (PyPI) | n/a | n/a | n/a | n/a | Python tool. Uses lizard for complexity and joins istanbul coverage | Adds a Python toolchain to a TS repo. No |
| `typhonjs-escomplex` | 0.1.0, 2022 | 142k | n/a | MPL | Complexity only (Babel-based) | Unmaintained since 2022, and our ESLint already computes the same metric |

**SonarQube Cloud.** The metric definitions cover cyclomatic and cognitive complexity and coverage per file/project, with no CRAP metric ([metric definitions](https://docs.sonarsource.com/sonarqube-cloud/digging-deeper/metric-definitions/)). Custom plugins are not available on SonarQube Cloud (SonarSource staff answer in the [community forum](https://community.sonarsource.com/t/does-sonarqube-cloud-support-third-party-plugins-like-the-mulesoft-sonarqube-plugin/138134)). It does accept a **generic external-issues JSON** through `sonar.externalIssuesReportPaths` ([Generic issue data](https://docs.sonarsource.com/sonarqube-cloud/enriching/generic-issue-data/)). So CRAP > threshold findings can show up in Sonar as issues. This fits the #195 principle: displayed by Sonar, gated by one owner. External rules can't be managed in Sonar's quality profiles (same page).

**Qlty (ex-Code Climate).** Its maintainability metrics are LOC, issues, and duplication/structure smells. CRAP isn't mentioned ([Qlty metrics](https://docs.qlty.sh/cloud/maintainability/metrics)).

## 2. The two inputs

**Coverage: istanbul `coverage-final.json` from both runners.**

- Jest's default `coverageReporters` already includes `json` ([Jest config](https://jestjs.io/docs/configuration#coveragereporters-arraystring--string-options)). `apps/api` writes to `apps/api/coverage/` (`coverageDirectory: "../coverage"` with `rootDir: src`).
- Vitest's default `coverage.reporter` is `['text', 'html', 'clover', 'json']` ([Vitest coverage config](https://vitest.dev/config/coverage)). With the v8 provider, Vitest remaps V8 data so it _"produces identical coverage reports to Istanbul"_ ([Vitest coverage guide](https://vitest.dev/guide/coverage)). Neither `apps/web` nor `packages/shared` has a coverage provider installed today.
- The file maps each source path to `fnMap`/`f` (functions + hit counts) and `statementMap`/`s` (statements + hit counts), in **source** coordinates (ts-jest and Vitest both apply source maps).

**Complexity: ESLint core `complexity` rule** ([rule docs](https://eslint.org/docs/latest/rules/complexity)). It counts `if`, ternaries, `&&`/`||`/`??`, loops, `catch`, `case`, default parameters/destructuring defaults, optional chaining links, and logical assignment. A `variant: "modified"` option counts a `switch` as 1. With `max: 0` every function reports its score, and it runs with the `typescript-eslint` parser already in the repo. Using the repo's own ESLint avoids a second complexity engine that would disagree with any `complexity` lint rule we might enable later.

## 3. The join (PoC)

The PoC is a throwaway script, not committed. It is ~80 lines of CommonJS that `require`s `eslint` and `typescript-eslint` from the repo root.

1. Lint each file in `coverage-final.json` with `Linter.verify` and the `typescript-eslint` parser. Enable `complexity: ["warn", 0]` plus a 3-line inline rule that collects every `FunctionDeclaration` / `FunctionExpression` / `ArrowFunctionExpression` node.
2. **Complexity → function node.** The `complexity` message is reported at the function _head_ (for arrows, the `=>` token). Take the innermost collected function node whose range contains the head. That node owns the score. Parse `N` from `"… has a complexity of N."`.
3. **Coverage per function.** Use the istanbul statements whose start lies inside the node, minus statements inside nested function nodes, so a callback's coverage doesn't leak into its parent. `cov = covered / total`.
4. `fnMap` is only a fallback for statement-less functions: called or not. It is matched by identical `loc.end`, else by `decl.start` inside the node.

Results on this repo (2026-10-12, `origin/main`):

| Source | Functions (AST) | istanbul `fnMap` entries | Joined | Runtime |
| --- | --: | --: | --: | --: |
| `apps/api`, Jest 29 + ts-jest, istanbul | 205 | 205 | 205 (all by `loc.end`) | ~0.5 s |
| `packages/shared`, Vitest 3.2.7 + `@vitest/coverage-v8` | 19 | **17** | 19 (2 via statements only) | <0.5 s |

Lessons the PoC surfaced:

- **Drive the join from the AST, not from `fnMap`.** The v8 remap omitted two executed anonymous callbacks from `fnMap`: the `superRefine` callback and its inner `forEach` callback in `stage-period.schema.ts`. Their statements were still in `statementMap`, so the AST-driven join still scored them (CC 5 and 4, 100%). A tool keyed on `fnMap` would silently drop them. Per its source ([`function-coverage.ts`](https://github.com/ahilke/js-crap-score/blob/main/src/crap/function-coverage.ts)), `crap-score` does exactly that: it iterates `fnMap` and counts every statement in the function's range, nested callbacks included.
- **Names: take them from the AST.** istanbul names are `(anonymous_N)` for class methods under ts-jest. Under Vitest they are SSR-mangled (`__vite_ssr_import_0__.z.object.refine.message`). The report should name a function from the AST: method key, variable declarator, or `file:line`.
- **Top api results** (sanity check): `main.ts bootstrap` CC 4 / 0% → 20. `AdminStageRequestsService` method at line 180 CC 3 / 0% → 12. Nothing is above 30 today.
- **Repo blocker for v8 coverage (relevant to the coverage ticket too).** `pnpm-workspace.yaml` overrides `test-exclude>glob: "7.2.3"` for Jest's `test-exclude@6`. `@vitest/coverage-v8@3` depends on `test-exclude@7`, which needs the glob ≥ 9 API. So `vitest --coverage` crashes with `TypeError: list.filter is not a function` in `getUntestedFiles`. The PoC ran with `coverage.all: false`. Adopting v8 coverage means scoping that override to `test-exclude@6>glob`.

## 4. Reporting options

| Channel | How | Notes |
| --- | --- | --- |
| **Job summary** | Append Markdown (top-N table, count above threshold) to `$GITHUB_STEP_SUMMARY` ([docs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)) | No extra permissions. Works for fork PRs. Recommended default |
| **Artifact** | `actions/upload-artifact` with the full JSON report | Lets a later ratchet compare against `main`'s report. Cheap |
| **PR comment** | `gh pr comment` / sticky comment | Needs `pull-requests: write`. Fork PRs get a read-only `GITHUB_TOKEN` ([token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)). Adds noise next to Sonar's own PR decoration. Optional |
| **SonarQube Cloud external issues** | Script also writes the generic-issue JSON (`ruleId: crap`, `primaryLocation.textRange` = function lines), passed via `sonar.externalIssuesReportPaths` | CRAP hotspots appear inline in Sonar / PR decoration without Sonar owning the gate. Depends on the Sonar ticket |
| **Check annotations** | `::warning file=…,line=…::CRAP 42` workflow commands | Inline on the PR diff. Capped per step (GitHub limits annotations), so use it for above-threshold functions only |

## 5. Candidate approaches and effort

| Approach | Effort | Pros | Cons |
| --- | --- | --- | --- |
| A. `crap-score` CLI per package | ~0.5 day | Mature-ish, HTML report | Second ESLint 8 / Nest 10 stack in the lockfile. Dependabot noise (map #128). Coverage keyed on `fnMap` (drops v8 callbacks, nested statements leak). No summary/comment output, so glue is needed anyway |
| B. `crap4ts` Action | ~0.5 day | PR comment, changed-only, artifact out of the box | Maintenance mode, v2 rewrite pending. GPL. 1-star single maintainer. Action installs `latest` via npx, which conflicts with #194's SHA-pinning posture |
| **C. In-repo script** (`scripts/crap/`, TS run with the repo toolchain) | **~1–1.5 days**: join (PoC done) + AST naming + summary/JSON/Sonar writers + unit tests on fixtures + one CI step per coverage job | Zero new deps (ESLint 9 + typescript-eslint already present). Same complexity engine as lint. AST-driven join handles both runners. Output shaped to our gate design (informative → blocking, threshold, later ratchet / changed-only) | We own ~150 LOC + tests |

**Recommendation: C.** It reuses the repo's ESLint/typescript-eslint, adds no third-party CI action or dependency, and the PoC removed the main risk (the join). The first iteration is informative. It writes the job summary + JSON artifact, plus a Sonar external-issues file once SonarQube Cloud is wired. Flipping to blocking later is a threshold or exit-code switch in the dedicated ticket #195 plans. Prerequisites: coverage JSON produced in CI for each package, and the `test-exclude>glob` override fix if web/shared use `@vitest/coverage-v8`.

## Open questions

- Coverage metric: statement coverage, as in the original definition and `crap-score`, or branch coverage (`crap4ts` offers both)? The PoC used statements. Branch coverage is stricter for high-CC functions.
- Classic vs. `modified` complexity variant (switch counts as 1).
- Changed-only (diff-scoped) vs. whole-repo gating once blocking. That ties into the ratchet design of the coverage ticket.
