---
"shared": patch
"api": patch
---

Fix `packages/shared` being unresolvable at runtime from `apps/api`. The package previously shipped raw `.ts` with `main`/`exports` pointing straight at `src/index.ts`; `nest build`'s type-check and Jest's `ts-jest` transform both passed, but `node dist/main.js` / `nest start` crashed as soon as anything imported from `shared`, since Node has no loader for `.ts` in a plain CommonJS `require`. `shared` now ships a compiled CommonJS build (`tsc -p tsconfig.build.json` → `dist/`), consumed identically by `apps/api`'s CJS runtime and `apps/web`'s bundler. See ADR-0016.
