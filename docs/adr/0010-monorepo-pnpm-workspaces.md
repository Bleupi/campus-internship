# ADR-0010 — Monorepo with pnpm workspaces

- Status: Accepted
- Deciders: dev

## Context

The project ships a NestJS API and a React front-end that must share typed code:
the `schoolYear` Zod value-object, the `Semester` enum, and API contract types.
Sharing typed code across two separate repositories would require either a
published npm package or duplication — heavy and error-prone for a single-author
demo project. A single build context also lets Claude Code see both sides of the
stack at once.

## Decision

Use a **monorepo managed with pnpm workspaces**:

```
apps/
  api/        # NestJS
  web/        # React + Vite
packages/
  shared/     # Zod value-objects, enums, API contracts (back <-> front)
```

Code and schema in English, UI in French. The shared package is the single
source of truth for cross-cutting validation and types.

**Turborepo is deferred** (see ADR-0010a note below). pnpm workspaces alone
handles code sharing; task running is done with `pnpm --filter` and `pnpm -r`.
Turborepo's value (task caching, `^build` orchestration) is marginal at this
scale and adds a tool to learn plus a class of cache-invalidation pitfalls. It
can be introduced later in a short, isolated change when build/CI time warrants
it.

## Consequences

- One `CLAUDE.md` at the root, optionally package-level `CLAUDE.md` files later.
- `packages/shared` must be consumed by both apps via the workspace protocol
  (`workspace:*`), not relative imports across app boundaries.
- Alternatives considered: two separate repos (rejected — painful code sharing);
  monorepo without workspaces (rejected — no clean shared-dependency management);
  Nx (rejected for now — more power but steeper curve and more opinionated);
  tRPC for the contract (deferred — couples front and back; REST kept for V1).
