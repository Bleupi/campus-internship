---
"api": patch
---

Fix `ConfigModule.forRoot`'s `envFilePath` resolving relative to `process.cwd()` instead of the app's own location — only correct when launched via `pnpm --filter api`/`pnpm dev`, silently wrong under a different launch path (Docker `WORKDIR`, IDE run config). Now resolved via `__dirname` (`apps/api/dist` at runtime, since `nest build`/`nest start` always run the compiled output), independent of invocation cwd. Same policy as the earlier `apps/web` `vite.config.ts` fix, adapted to CommonJS. Verified booting from three different working directories, including one outside the repo entirely.
