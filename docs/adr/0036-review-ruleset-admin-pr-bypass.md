# ADR-0036 — Review required for non-admin writers, admin bypass through PRs only

- Status: Accepted
- Date: 2026-10-12
- Deciders: project owner
- Supersedes (in part): ADR-0028 §3 — only its "no required-approving-review count" point; the rest of §3 (PR required, required status checks, up-to-date branch, no force-push or deletion) stands
- Related: ADR-0028 (branch protection on `main`), #194, #212

## Context

ADR-0028 §3 rejected a required-approving-review count on `main` as theater for a solo maintainer, and said to revisit it "if a second collaborator with write access is added".

That has happened. A collaborator with the `write` role was added to read the code; they don't take part in development, so the project still has a single maintainer. The `write` role lets its holder merge a PR. With only ADR-0028's rules, any `write` collaborator could merge a PR with green checks, their own included, without the maintainer's approval.

A repository ruleset, "Block merge without review", already covered this case. It was created on 2026-09-02, before ADR-0028 was written, and never recorded. On `main` it requires:

- 1 approving review, including approval of the most recent push;
- every review thread resolved;
- squash or rebase merges only;
- no deletion and no force-push.

The Repository admin role is its only bypass actor.

#212 then made `main`'s rules apply to administrators: classic branch protection enforces them for admins (`enforce_admins`), and the "Protect main" ruleset has no bypass actor. The open question was whether the review ruleset should lose its admin bypass too. It can't: the maintainer authors or co-authors almost every PR, cannot approve their own PR, and nobody else reviews. Without the bypass, nothing could merge.

## Decision

1. **Keep the "Block merge without review" ruleset.** One approving review is required from anyone who merges without the admin role. This is preventive: the rule is already in place for the day another `write` collaborator joins.
2. **Keep a single bypass actor, the Repository admin role, in `pull_request` mode.** The maintainer may merge their own PR without an approval, and only by merging a PR. The bypass never covers a direct push, a force-push or a branch deletion.
3. **Everything else applies to the admin as well.** Classic branch protection enforces PR-before-merge and the two required status checks for administrators. The "Protect main" ruleset forbids deletion and force-push with no bypass actor.

## Consequences

- Nobody can land a change on `main` without a PR and green checks, the maintainer included.
- A `write` collaborator can open PRs, but they can't merge one without an approval. In practice, that means the maintainer's.
- The maintainer's own PRs merge without an approval. Review of those PRs stays the self-review loop described in `CONTRIBUTING.md`.
- `pull_request` mode makes no difference day to day: the other two layers already block direct pushes, force-pushes and deletions. It matters only if `enforce_admins` is ever switched off. Even then, this ruleset still requires a PR.
- In an emergency, a direct push to `main` needs both `enforce_admins` and this bypass mode changed by hand. Both changes show up in the repository's audit log.
- ADR-0028's revisit trigger for CODEOWNERS ("a second collaborator with write access") does not fire. The new collaborator doesn't contribute, so CODEOWNERS stays deferred until a second person actively develops.

## Alternatives considered

- **Remove the admin bypass from the review ruleset.** Rejected: with a single maintainer who authors almost every PR, no PR could ever be merged.
- **Delete the review ruleset and keep ADR-0028's zero-approval count.** Rejected: any `write` collaborator could then merge without the maintainer's approval. The ruleset is the only thing that prevents it.
- **Lower the collaborator to `read` or `triage`, or remove them.** Viable, but not chosen. On a public repository reading needs no role anyway. Keeping the ruleset protects against any future `write` collaborator instead of relying on remembering to restrict each one.
- **Keep the bypass in `always` mode.** Rejected: it lets the ruleset be bypassed by a direct push as well, for no benefit, since merging through a PR is the only path the maintainer needs.
