# ADR-0016 — `packages/shared` ships a compiled CommonJS build

- Status: accepted
- Date: 2026-08-18
- Deciders: project owner
- Related: ADR-0010 (monorepo pnpm workspaces)

## Context

ADR-0010 established that `packages/shared` is consumed by both apps via the workspace protocol, but left open how that resolution actually works at runtime. Since the scaffold, `packages/shared/package.json` pointed `main`/`exports` straight at the raw `./src/index.ts`. That's transparent to tooling that transpiles TS itself (tsc's own type-checker, `ts-jest`, Vite/esbuild) — but `apps/api` compiles ahead-of-time to CommonJS (`nest build` → `dist/main.js`) and the compiled output does a plain `require("shared")`. Node has no loader for `.ts` at that point: `node dist/main.js` / `nest start` crash with `ERR_UNSUPPORTED_DIR_IMPORT` the moment any module actually imports from `shared`. `nest build`'s type-check and Jest's `ts-jest` transform both succeed, so this passed CI and code review silently until traced end-to-end.

## Decision

`packages/shared` gets a real build step: `tsc -p tsconfig.build.json` emits CommonJS to `dist/`, and `package.json`'s `main`/`types`/`exports` point at the compiled output (`./dist/index.js` / `./dist/index.d.ts`) instead of the raw source. A single CJS build serves both consumers — `apps/api`'s own CJS runtime needs it directly, and Vite/esbuild (`apps/web`) already bundles CJS dependencies routinely, so no dual ESM+CJS output is needed.

`pnpm -r run build` builds packages in workspace dependency order, so `shared` builds before `api`/`web` with no root script change. For local dev, `shared` gets its own `dev` script (`tsc --watch`) and the root `dev` script runs `-r --if-present` instead of `--filter ./apps/*`, so editing `packages/shared` while `pnpm dev` is running recompiles it instead of silently going stale against the last build.

## Consequences

- `apps/api`'s production start path (`node dist/main.js`) and `nest start --watch` now actually resolve `shared` at runtime, not just at type-check time.
- One more build artifact to reason about: `packages/shared/dist/` (git-ignored, already covered by the existing `dist/` ignore rule).
- A stale `dist/` (e.g. someone runs `pnpm dev` without ever building `shared` once, or edits `shared` with the watcher not running) reintroduces the failure mode this ADR fixes, just non-obviously — mitigated by the `dev`-script wiring above, not eliminated.

## Alternatives considered

- **Rely on Node's native TypeScript type-stripping** (Node 22.6+/24 experimental support) instead of a build step. Rejected: version-gated, still requires explicit file extensions on every relative import (the barrel `export * from "./enums"` would need rewriting throughout), and ties a portfolio project's core scaffold to an experimental runtime feature rather than a well-understood, ecosystem-standard build step.
- **Dual ESM+CJS output** (e.g. via `tsup` or manual dual `tsc` passes) for a "proper" package. Rejected as overkill: `apps/web`'s bundler already consumes CJS transparently, so a second build target buys nothing at this scale.
- **`tsx`/`ts-node` as the production runtime** for `apps/api` (skip building `packages/shared`, and `apps/api` too, entirely — run TS directly in prod). Rejected: changes `apps/api`'s own deployment story for a problem that's local to `packages/shared`, and moves a dev convenience into the production path.
