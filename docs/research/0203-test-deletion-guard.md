# Research: mechanics for a test-deletion guard (CI count + pre-push agent)

Source ticket: https://github.com/Bleupi/campus-internship/issues/203 (child of map #195) Related: `.husky/pre-push`, `eslint.config.js`, `.github/workflows/pr-validation.yml`, `.claude/settings.json`, ADR-0013, ADR-0015, ADR-0022

Versions in the repo when this was written (2026-10-12): Jest 29.7.0 (apps/api), Vitest 3.2.7 (apps/web, packages/shared), ESLint 9.39 flat config, Husky 9.1.7, Claude Code 2.1.296. "Measured" means run locally in this repo on an Apple-silicon Mac, or read from the step timings of PR-validation run 37689722978. Everything else cites its source.

## TL;DR

- **Counting test cases:** Jest 29 has no way to list test cases without running them. `--listTests` lists files only. `jest --json` gives `numTotalTests`, but only after a full run. `--collectTests` (list without running) arrived in **Jest 30.4.0**, and its counts match a real run from **30.5.0**. Vitest 3 has `vitest list --json`, which lists test cases without running their bodies but still imports every file, so it needs `packages/shared` built and `VITE_API_BASE_URL` set. Vitest's `json` reporter uses the same output shape as Jest's.
- **Cost:** the head count is free because the existing "Unit tests" / "E2e tests" steps can add `--json --outputFile`. The base count costs either a second test run (about 70 s unit + 16 s e2e in CI) or a collect-only pass (seconds, but Jest needs the v30 upgrade first).
- **Lint:** none of these rules are set up in the repo today: no `eslint-plugin-jest`, no `@vitest/eslint-plugin`. Both plugins ship `no-disabled-tests` (warn in recommended), `no-focused-tests` (error), `no-commented-out-tests` and `expect-expect`. `pnpm lint` already runs with `--max-warnings=0`, so a recommended-config warning already fails CI. Vitest also fails on `.only` in CI by default (`allowOnly: !process.env.CI`).
- **PR label + PR-body section:** `pull_request` runs only on `opened`/`synchronize`/`reopened` by default. Add `labeled`, `unlabeled` and `edited` to the trigger. Read the label in an `if:` expression. Pass the body through an `env:` variable, never `${{ }}` inside `run:`, because that is the template-injection risk zizmor flags.
- **Pre-push agent:** this works today. Measured: a headless `claude -p` call reviewing a 33 KB test diff with Haiku, no tools and `--json-schema` took **16 s** and cost about **$0.008**. It works when run inside a Claude Code session (`CLAUDECODE=1`). Failures exit 1: bad auth fails in about 1 s; **offline it retries for about 181 s** before failing. The hook needs a retry cap and a wall-clock cap.
- **One script for both paths:** yes. A Claude session's `git push` goes through Git, so it already triggers Husky's `pre-push`. A Claude Code `PreToolUse` hook is not needed to run the review. It is only useful as a cheap, deterministic block on bypasses (`--no-verify`, `HUSKY=0`). `gh pr create --head` never pushes, and CI covers that path anyway.

---

## 1. Deterministic CI check

### 1.1 Counting test cases: base vs head

**Jest (apps/api, 29.7.0).**

- `--json`: "Prints the test results in JSON. This mode will send all other test output and user messages to stderr." With `--outputFile=<filename>`, Jest writes the results to a file, in the shape documented under `testResultsProcessor` ([Jest CLI 30.5](https://jestjs.io/docs/cli)). Measured on apps/api: `numTotalTests: 278`, `numPendingTests: 0`, `numTodoTests: 0`, `numTotalTestSuites: 22`. Each `testResults[].assertionResults[]` has `ancestorTitles`, `fullName`, `title` and `status`. This means the check can compare the **set of test identities** (file + `fullName`), not only the total count.
- `--listTests`: "Lists all test files that Jest will run given the arguments, and exits." ([Jest 29.7 CLI](https://jestjs.io/docs/29.7/cli)). This gives files, not test cases, so it catches a deleted spec file but not a deleted `it`. Measured: 0.65 s.
- Listing test cases without running them: `--collectTests`: "Discover and print all test suites and test names without executing them … evaluates the top-level `describe` blocks to register tests, then exits before running any test code or lifecycle hooks". `jest --collectTests --json` is "machine-readable, same shape as a normal run", with skipped tests reported as `pending` and `test.todo` as `todo` ([Jest CLI 30.5](https://jestjs.io/docs/cli)).
  - **Not in Jest 29.7:** the 29.7 CLI page has no such option.
  - The flag arrived in **30.4.0** (`--collect-tests`, [#16006](https://github.com/jestjs/jest/pull/16006)). In **30.5.0** it began expanding `test.each`/`describe.each` and reporting per-status counts "that match a real run" ([#16259](https://github.com/jestjs/jest/pull/16259)) ([CHANGELOG](https://github.com/jestjs/jest/blob/main/CHANGELOG.md)).
  - So a collect-only count for the API depends on the Jest 30 major upgrade, which belongs to map #128.
  - It would also make the **e2e** count free, because e2e collection needs no database.

**Vitest (apps/web, packages/shared, 3.2.7).**

- `vitest list`: "inherits all `vitest` options to print the list of all matching tests". Use `--json` (or `--json=<file>`) for machine-readable output and `--filesOnly` for files only ([Vitest CLI](https://vitest.dev/guide/cli)).
  - In **Vitest 5** it "parses test files statically instead of running them" (opt out with `--no-static-parse`).
  - **In Vitest 3 it imports the files** (measured). Module-level side effects run, so the web list first failed with `Invalid environment variable "VITE_API_BASE_URL"` thrown from `src/lib/api-client.ts`. It also needs `packages/shared` built.
  - Output (measured) is a flat array of `{ name: "describe > … > test", file }`.
  - Measured: shared 1.2 s; web 3.6 s for 334 tests, against 23 s for the full web run.
- The `json` reporter "generates a report … in a JSON format compatible with Jest's `--json` option", with the same counters (`numTotalTests`, `numPendingTests`, `numTodoTests`, `testResults[].assertionResults[].status`). Use it with `--reporter=json --outputFile=…` ([Vitest reporters](https://vitest.dev/guide/reporters)).
  - One parser therefore covers both runners for full-run output.
  - `vitest list --json` has a different, simpler shape.

**Cost in CI (measured on PR-validation run 37689722978).**

- Steps: "Unit tests" 68 s, "E2e tests" 16 s, install 13 s, build 13 s.
- **Head count:** adding `--json --outputFile` (Jest) or `--reporter=json --outputFile` (Vitest, alongside the default reporter) to the existing steps adds ≈0 s.
- **Base count**, three options:
  - **(a)** Check out the base SHA and re-run everything: ≈ +100 s, and e2e needs the services again.
  - **(b)** Collect-only on the base: seconds for Vitest. For Jest this needs v30.4+ (unit **and** e2e, no DB). On Jest 29, the e2e base count would still need a run against a database.
  - **(c)** Save the head counts as an artifact on each `main` run, and have the PR job read the artifact for its merge-base. Zero extra test time, but it adds cross-run artifact plumbing, and it needs a fallback when the merge-base has no artifact.

**Count vs identity.**

- A net-count drop misses a swap: delete a real test and add a trivial one.
- Comparing the sets of `file + fullName` catches every removed test, but treats a rename as remove + add, so renames need the same label/justification path.
- Either way, a change to runner config is caught by the count, because the tests simply disappear. Examples: `testPathIgnorePatterns`, Vitest `exclude`, a `testRegex` change.

### 1.2 Lint rules (`.skip` / `.only`)

**Currently configured:** none. `eslint.config.js` loads only `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh` and `eslint-config-prettier`. No Jest or Vitest plugin is installed (`pnpm ls -r`).

**eslint-plugin-jest** ([README](https://github.com/jest-community/eslint-plugin-jest)):

- `jest/no-disabled-tests` flags:
  - `describe.skip`/`it.skip`/`test.skip`, including bracket forms
  - `xdescribe`/`xit`/`xtest`
  - a test "with a name but no function body"
  - `pending()` inside a test

  It does **not** catch aliases such as `const testSkip = test.skip` ([rule doc](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-disabled-tests.md)).

- `jest/no-focused-tests` flags `describe.only`, `it.only`, `test.only`, `fdescribe` and `fit` ([rule doc](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-focused-tests.md)).
- Recommended severities (README config): `no-disabled-tests: 'warn'`, `no-focused-tests: 'error'`. `no-commented-out-tests` and `expect-expect` are also in recommended.

**@vitest/eslint-plugin** ([README](https://github.com/vitest-dev/eslint-plugin-vitest), [src/index.ts](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/src/index.ts)):

- `vitest/no-disabled-tests`, `vitest/no-focused-tests`, `vitest/no-commented-out-tests` and `vitest/expect-expect`, all in `recommended`.
- Recommended severities: `no-disabled-tests: 'warn'`, `no-focused-tests: 'error'`, `no-commented-out-tests: 'error'`, `expect-expect: 'error'`.
- Needs ESLint ≥ 9. Uses a flat-config `plugins: { vitest }` plus `...vitest.configs.recommended.rules`, scoped by `files`.

**`warn` already blocks here:** the root `lint` script is `eslint . --max-warnings=0` (`package.json`), so a recommended-level `warn` already fails `pnpm lint` in CI. The open decision is the **justified** escape hatch: inline `eslint-disable-next-line … -- reason` comments versus the PR label. There is no need to raise severities.

**Runtime backstop for `.only`:** Vitest's `allowOnly` defaults to `!process.env.CI`: "Vitest does not permit tests marked with the only flag in Continuous Integration (CI) environments" ([config](https://vitest.dev/config/allowonly)). Jest has no equivalent; `--ci` only changes snapshot behaviour ([Jest CLI](https://jestjs.io/docs/cli)). So on the API side, `.only` is caught only by lint.

### 1.3 Reading a PR label and a required PR-body section safely

**Triggers.**

- "By default, a workflow only runs when a `pull_request` event's activity type is `opened`, `synchronize`, or `reopened`." `labeled`, `unlabeled` and `edited` are separate activity types ([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
- Add or remove the label, or edit the body to add the justification, and the check must re-run. So the guard job needs `types: [opened, synchronize, reopened, labeled, unlabeled, edited]`.
- Put the guard in its **own small workflow/job**. Otherwise a label click re-runs the full 2-minute validate job, and the shared `concurrency: cancel-in-progress` group lets a label event cancel an in-flight test run.
- If the guard's count comes from the validate job's artifacts, the label-event run needs the latest head-SHA artifact rather than a re-run.
- Map #195's pitfall applies: skip inside the job, never with a trigger filter, or a required check hangs "pending".

**Injection.**

- GitHub lists `body`, `head_ref`, `label`, `message`, `name`, `ref` and `title` among the context properties that are typically untrusted, with `github.event.pull_request.body` as an example ([Script injections](https://docs.github.com/en/actions/concepts/security/script-injections)).
- The preferred mitigation is an intermediate environment variable, e.g. `env: TITLE: ${{ github.event.pull_request.title }}`, then `"$TITLE"` in the script ([Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)).
- zizmor's `template-injection` audit flags `${{ }}` expansions in code contexts. It says to replace them with an env var and to reference it as `${VARNAME}`, **not** `${{ env.VARNAME }}`, "since that is still a template expansion" ([zizmor audits](https://docs.zizmor.sh/audits/)).

**Concrete safe pattern:**

- **Label:** `if: contains(github.event.pull_request.labels.*.name, 'tests-removed')`. The expression is evaluated by the runner and never interpolated into shell.
- **Body:** `env: PR_BODY: ${{ github.event.pull_request.body }}`, then `printf '%s' "$PR_BODY" | grep -q '^## Tests removed'`, plus a minimum length or non-placeholder check.
- **Permissions:** `contents: read` is enough, because the payload already carries labels and body. No `pull_request_target` is needed.

---

## 2. Agent check

### 2.1 Husky `pre-push` calling `claude -p`

**What Git passes the hook** ([githooks](https://git-scm.com/docs/githooks#_pre_push)):

- Arguments: the remote name and URL.
- **stdin:** one line per ref, `<local-ref> SP <local-object-name> SP <remote-ref> SP <remote-object-name> LF`.
  - A new remote ref has an all-zeroes `<remote-object-name>`.
  - A deletion has `(delete)` and an all-zeroes local OID.
- "If this hook exits with a non-zero status, git push will abort without pushing anything."
- `git push --no-verify`: "the hook is bypassed completely" ([git-push](https://git-scm.com/docs/git-push)).

**Outgoing diff:**

- For each ref, use `remote_oid..local_oid`. For a new branch, use `$(git merge-base origin/main local_oid)..local_oid`. Skip deletions.
- If `remote_oid` is not present locally (someone else pushed), fall back to the merge-base.
- Restrict the diff to `*.spec.ts`, `*.e2e-spec.ts`, `*.test.ts(x)`, `apps/api/test/jest-e2e.json`, the `jest` block of `apps/api/package.json`, and the `vite.config.ts`/`vitest` config.
- If the range touches none of them, exit 0 without calling Claude. This is the common case and costs nothing.

**How Husky runs the hook** (`node_modules/husky/husky`, v9.1.7):

- It runs the hook with `sh -e "$s" "$@"`, so stdin is inherited and the hook can read it.
- `HUSKY=0` skips every hook.
- **Read stdin first** (`refs=$(cat)`), before the existing gitleaks and `pnpm typecheck` lines, so nothing else consumes it.
- The hook runs under `-e`, so any unguarded failing command aborts the push.

**Headless flags** ([headless docs](https://code.claude.com/docs/en/headless), `claude --help` v2.1.296):

- `-p` reads stdin, so pipe the diff in. Piped stdin is capped at 10 MB.
- `--output-format json` returns `result`, `is_error`, `session_id`, `total_cost_usd`, and `structured_output` when used with `--json-schema`. An invalid schema exits with an error.
- `--model haiku|sonnet|<id>`.
- `--tools ""` disables all built-in tools. The diff is the only input, so no permission prompts are possible.
- `--no-session-persistence`.
- `--max-budget-usd <amount>` (with `-p` only).
- `--bare`, which docs say "is the recommended mode for scripted and SDK calls". It skips hooks, CLAUDE.md, plugins and MCP. In bare mode "Claude Code never reads OAuth credentials or the system keychain": it needs `ANTHROPIC_API_KEY` (or `apiKeyHelper`).
  - So **`--bare` cannot use the owner's Pro/Max login**. Without `--bare`, `-p` uses the logged-in subscription.
  - Without `--bare`, a `-p` run in the repo also runs the project's `.claude/settings.json` hooks. That is harmless with `--tools ""`, apart from SessionStart-type hooks.

**Exit codes:**

- "Claude Code exits with code 0 on success and a non-zero code when the run fails … When a failure happens inside the run, such as missing authentication, Claude Code prints the failure as the result on stdout" ([headless](https://code.claude.com/docs/en/headless)).
- SIGTERM exits 143.
- Measured:
  - Invalid key: **exit 1 after ~1 s**, JSON `is_error: true`, `terminal_reason: "api_error"`, `result: "Invalid API key …"`.
  - API unreachable (`ANTHROPIC_BASE_URL=http://127.0.0.1:9`): **exit 1 after ~181 s** of retries, `result: "API Error: Connection refused …"`.
- Retries default to 10 (`CLAUDE_CODE_MAX_RETRIES`). `API_TIMEOUT_MS` defaults to 600 000 ([env vars](https://code.claude.com/docs/en/env-vars)).
- A pre-push hook therefore needs `CLAUDE_CODE_MAX_RETRIES=1` (or similar) **and** a wall-clock cap. macOS ships no `timeout(1)`, so use `perl -e 'alarm …; exec …'` or a tiny Node wrapper.

**Runtime and cost (measured):**

- Haiku, `--tools ""`, `--json-schema {verdict: ok|suspicious, reasons[]}`, on a real 33 KB test diff (`origin/main~3..origin/main`): **exit 0, 16 s wall (14.7 s API), $0.0077**.
- The verdict was correct and specific: it saw that the copy-change edits tightened matchers rather than loosening them.
- Sonnet will be slower and costlier. Not measured.

**Running from inside a Claude session:** measured with `CLAUDECODE=1`, where `CLAUDECODE` is set "in subprocesses Claude Code spawns (Bash … hook commands …)" ([env vars](https://code.claude.com/docs/en/env-vars)). A nested `claude -p` ran normally, so the same hook works for agent-initiated pushes.

**Fail open or closed (facts that bear on the decision):**

- An infrastructure failure (offline, logged out, quota) is distinguishable from a verdict:
  - Infrastructure failure: non-zero exit, or `is_error: true`, or no `structured_output`.
  - Verdict: exit 0 and `structured_output.verdict`.
- The hook is bypassable (`--no-verify`, `HUSKY=0`), so it can never be the sole gate.
- Map #195's principle is "one blocking owner per concern", and the CI count check is the non-bypassable owner. Infrastructure failures can therefore fail **open** with a loud warning, and the open decision is only whether a `suspicious` verdict blocks the push or just warns.
- A verdict-level override is also needed, e.g. `TEST_GUARD_ACK=1 git push`, recorded in the PR body section that CI already requires.

**Caching by SHA:**

- Key the cache on the pushed `local_oid`, or better on `git patch-id`/the hash of the filtered diff, so a rebase with identical test changes stays cached.
- Store it under `$(git rev-parse --git-common-dir)/test-guard/<key>.json`. The common dir is shared by all worktrees and never committed.
- A re-push of the same tip, or the PreToolUse path below, then costs nothing.

### 2.2 Claude Code hooks for agent sessions

From the hooks reference ([hooks](https://code.claude.com/docs/en/hooks)):

**Matching `git push`:**

- `PreToolUse` with `matcher: "Bash"` and `if: "Bash(git push *)"`. `if` uses permission-rule syntax.
- "Leading `VAR=value` assignments are stripped before matching", so `HUSKY=0 git push …` still matches.
- Compound commands are matched per sub-command.
- The filter is "best-effort": "use the permission system rather than a hook to enforce a hard allow or deny".

**Blocking:**

- "Exit with code 2 to block the action … The message that comes with the block is your hook's stderr."
- Exit 1 is a **non-blocking** error.
- Alternatively, exit 0 with JSON `hookSpecificOutput.permissionDecision: "deny"` plus `permissionDecisionReason`.
- stdin JSON carries `tool_name` and `tool_input.command`.
- Command hooks default to a 600 s timeout.

**Hook types:**

- `prompt` (single LLM call, `{ok, reason}`, default timeout 30 s) and `agent` (subagent with Read/Grep/Glob, up to 50 turns, default timeout 60 s, "experimental … prefer command hooks" for production).
- Both are supported on `PreToolUse`.
- A prompt hook only sees the hook-input JSON (the command string), **not** the diff, so it cannot judge test weakening without an agent hook re-deriving the diff.

**`gh pr create`:** "When the current branch isn't fully pushed … a prompt will ask where to push", and "Use `--head` to explicitly skip any forking or pushing behavior" ([gh pr create](https://cli.github.com/manual/gh_pr_create)). When `gh` does push, it runs `git push`, so `pre-push` fires. With `--head` nothing is pushed, so there is nothing new to review locally, and CI covers the PR.

### 2.3 Can one script serve both paths?

**Yes.** Keep the review in `.husky/pre-push`, which delegates to one script such as `scripts/test-guard.sh`:

- **Manual pushes** run it via Git.
- **Claude-session pushes** also run it via Git: the Bash tool executes `git push`, which runs Husky. The agent sees the hook's stderr as the failed command's output, so feedback reaches it without a Claude Code hook.
- **What a Claude Code `PreToolUse` hook adds:** only the deterministic bypass block. It denies (exit 2) Bash commands containing `--no-verify` or `HUSKY=0` on a push. CLAUDE.md §10 already forbids `--no-verify`, but a hook enforces it.
- **If the hook also called the review script**, the review would run twice per push (hook, then pre-push). The SHA cache makes the second run free, but it adds nothing.
- **Agent-hook type:** not needed. It is experimental, and the command-script path already sees the real diff.

---

## Open questions

- Whether a `suspicious` verdict blocks the push or only warns (fail-open on infrastructure errors is assumed above). This is for the grilling ticket.
- Model choice: Haiku was measured. Sonnet's latency and accuracy on this task were not measured.
- Whether to upgrade Jest to ≥30.5 (map #128) before the CI check, to get collect-only counts for the API unit and e2e suites. The alternative is the base-artifact or double-run approach on Jest 29.
- `--setting-sources` with an empty value, to keep project hooks out of a non-bare `claude -p` run while still using the subscription login, was **not verified**.
- Whether `--json-schema` output is guaranteed under `--tools ""` on every model. It was observed only for Haiku.
