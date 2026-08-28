#!/usr/bin/env bash
# PreToolUse hook on the Skill tool. Only acts when the invocation is
# /mattpocock-skills:implement <gh-issue-link> — every other Skill call is a
# silent no-op (exit 0, no stdout). Enforces this project's branching
# convention (CLAUDE.md/CONTRIBUTING.md: never commit straight to main,
# always branch per task) by cutting a fresh branch off up-to-date
# origin/main before the skill's own instructions run.
set -euo pipefail

input="$(cat)"
skill="$(printf '%s' "$input" | jq -r '.tool_input.skill // empty')"

if [ "$skill" != "mattpocock-skills:implement" ]; then
  exit 0
fi

args="$(printf '%s' "$input" | jq -r '.tool_input.args // empty')"

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  deny "Not inside a git repository — cannot prepare a fresh branch for /implement."
fi

# Never switch branches over uncommitted work — see CLAUDE.md's git safety
# guardrails. Ask the human to commit/stash first instead of guessing.
if [ -n "$(git status --porcelain)" ]; then
  deny "Uncommitted changes are present. Commit, stash, or discard them first, then re-run /implement so the fresh branch starts clean."
fi

if ! git fetch origin main --quiet; then
  deny "git fetch origin main failed — check network/remote access before running /implement."
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "main" ]; then
  if ! err="$(git checkout main --quiet 2>&1)"; then
    deny "git checkout main failed: $err"
  fi
fi

if ! err="$(git merge --ff-only origin/main --quiet 2>&1)"; then
  deny "Local main could not fast-forward to origin/main: $err"
fi

issue_num="$(printf '%s' "$args" | grep -oE '[0-9]+' | tail -1 || true)"
if [ -n "$issue_num" ]; then
  base_branch="agent/issue-${issue_num}"
else
  base_branch="agent/implement-$(date +%s)"
fi

branch="$base_branch"
suffix=1
while git show-ref --verify --quiet "refs/heads/$branch" \
  || git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; do
  suffix=$((suffix + 1))
  branch="${base_branch}-${suffix}"
done

if ! err="$(git checkout -b "$branch" --quiet 2>&1)"; then
  deny "Failed to create branch $branch off main: $err"
fi

issue_note=""
if [ -n "$issue_num" ]; then
  issue_note=" (issue #$issue_num)"
fi

context="Prepared a fresh branch '$branch' off up-to-date origin/main for this /implement run${issue_note}. Commit and push your work on this branch; open the PR from it directly rather than creating another branch first."

jq -n --arg ctx "$context" --arg msg "implement-fresh-branch: switched to $branch" \
  '{systemMessage: $msg, hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext: $ctx}}'
