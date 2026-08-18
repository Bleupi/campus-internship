---
"web": patch
---

Fix `VITE_API_BASE_URL` always resolving to `undefined` at runtime. `vite.config.ts` had no `envDir`, so Vite only looked for `.env` inside `apps/web` while the repo's single `.env` lives at the monorepo root — every `apiClient` call silently hit `fetch("undefined/...")`. `envDir` is now computed from the config file's own location (independent of invocation cwd), and `api-client.ts`'s unsafe `as string` cast is replaced with a small `readEnvVar` helper (`apps/web/src/lib/env.ts`) that trims and validates against a Zod schema, throwing a clear error instead of silently propagating a bad value.
