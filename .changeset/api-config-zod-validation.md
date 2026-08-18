---
"api": patch
---

Fix `API_PORT ?? 3000` not guarding against an empty-string env value (`API_PORT=""` would call `app.listen("")` instead of falling back to 3000). Env access now goes through Nest's `ConfigModule.forRoot({ validate })` with a Zod schema (`apps/api/src/config/env.schema.ts`) instead of raw `process.env` reads: `API_PORT` is coerced/validated (fails loudly at boot if empty or out of range) and `CORS_ORIGINS` is trimmed and split into an array by the schema itself. `main.ts` now reads both through `ConfigService` instead of `process.env` directly.
