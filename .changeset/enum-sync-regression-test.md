---
"api": patch
---

Add a regression test (`apps/api/src/prisma/enum-sync.spec.ts`) guarding against `schema.prisma`'s enum blocks drifting from `packages/shared`'s TS enums — the two are hand-maintained independently (Prisma's schema DSL can't import TS, and `packages/shared` can't import the generated Prisma client without breaking its runtime-agnostic guarantee for `apps/web`), so nothing previously caught a one-sided edit. Verified the test fails when the two sets diverge, and passes once they match.

Also added `pretypecheck`/`pretest`/`pretest:e2e` scripts to `apps/api` that build `packages/shared` first — this test is the first thing in `apps/api` to actually import from `shared` at type-check/test time, which exposed that `pnpm typecheck`/`pnpm test` previously failed on a fresh checkout before `packages/shared`'s compiled output existed.
