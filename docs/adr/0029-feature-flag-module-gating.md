# ADR-0029 — Feature flags via conditional module registration, not a guard

- Status: Accepted
- Date: 2026-09-17
- Deciders: project owner
- Related: ADR-0012 (env var handling precedent), ADR-0019 (Zod validation pipe)

## Context

Issue #113 introduces the whole stage-management feature (this ticket and the rest of the #113–#119 batch) behind a flag: off by default, so the backend API for stage management doesn't exist and the frontend registers no route or nav entry for it. This is the **first** feature flag in the codebase — there is no prior precedent for how a flag should gate a whole feature's routes.

Two shapes were available for the backend half:

1. **Guard-based**: always register `StagesModule`/`OrganismsModule` in `AppModule`, and add a guard that checks the flag on every request, returning 401/403 when off.
2. **Module-graph gating**: only include `StagesModule`/`OrganismsModule` in `AppModule.imports` when the flag is on; when off, their routes don't exist in the Nest module graph at all.

This is a genuine "lasting consequences" decision per `CLAUDE.md` §4 — every future feature flag in this codebase will follow whichever shape is decided here, and it dictates the observable behavior (404 vs 401/403) that the frontend, API consumers, and monitoring all see while a feature is dark.

## Decision

**Module-graph gating.** `AppModule`'s `imports` array conditionally spreads in `StagesModule`/`OrganismsModule`:

```ts
...(process.env.FEATURE_STAGE_MANAGEMENT === "true" ? [StagesModule, OrganismsModule] : []),
```

With the flag off, these modules are never part of the module graph — their routes true-404 (`Cannot POST /stages`), not a guard-blocked 401/403. This was chosen over a guard for two reasons:

- **A dark feature should look absent, not merely locked.** A 401/403 confirms to any caller (including an unauthenticated one probing the API) that the route exists and is just access-controlled; a 404 gives no such signal — indistinguishable from a route that was never built.
- **No guard can accidentally be bypassed or misapplied per-route.** A guard-based flag requires remembering to attach it to every new controller/route the feature adds as the feature grows across the #113–#119 batch; module-graph gating is enforced once, structurally, and a new controller added to `StagesModule` is automatically covered without further action.

`process.env.FEATURE_STAGE_MANAGEMENT` is read directly, not via `ConfigService` (which isn't available yet at this point in `AppModule`'s own construction). This is safe, not a race: `ConfigModule.forRoot()` — despite being declared `async` — runs its `assignVariablesToProcess(validatedConfig)` call synchronously, before its first internal `await` (confirmed by reading `@nestjs/config`'s source). Since `imports` is a plain array literal evaluated left-to-right, and the conditional spread is placed _after_ the `ConfigModule.forRoot(...)` entry, `process.env.FEATURE_STAGE_MANAGEMENT` already holds the validated/transformed value (`"true"`/`"false"`, same string-transform pattern as `S3_FORCE_PATH_STYLE`) by the time the conditional is evaluated. This ordering dependency is fragile to a future refactor that reorders `AppModule`'s `imports` — a comment at the call site records it.

The frontend mirrors this with its own flag, `VITE_FEATURE_STAGE_MANAGEMENT`, read once as `isStageManagementEnabled` in `apps/web/src/lib/feature-flags.ts`. Vite inlines `import.meta.env.*` at build time, so the flag-off branches (the `/stages/*` route in `App.tsx`, the nav item in `AppShell.tsx`) are dead-code-eliminated from the bundle — a stronger guarantee of "no route/nav entry at all" than a runtime check.

Two independent flags (one per app) rather than one shared value: the backend and frontend are separately deployed (ADR-0022) and read their env vars through entirely different mechanisms (`ConfigModule` server-side vs. Vite's build-time `import.meta.env` substitution client-side) — there is no single runtime value to share between them, so each side declares and validates its own copy. Keeping them in sync is an operational concern (documented in `.env.example`), not a code-sharing one.

## Consequences

- Every future feature flag in this codebase should default to this shape (module-graph gating) for backend routes, and the Vite-inlined-constant shape for frontend routes/nav, unless a specific case needs partial/per-request gating that only a guard can express (e.g. a flag that varies by user role or percentage rollout — not a case this codebase has yet).
- The `AppModule.imports` ordering dependency (conditional spread must stay after `ConfigModule.forRoot()`) is a maintenance trap for anyone reordering that array without reading the comment. Accepted as a documented tradeoff rather than solved with a heavier mechanism (e.g. a synchronous config-loading step before `@Module` decoration runs), which would be disproportionate for a single-admin, low-churn codebase.
- Removing the flag once the feature is validated in production (issue #119) is simply deleting the conditional and always including the modules — no migration of the mechanism itself is needed.

## Alternatives considered

- **Guard-based gating** (`FeatureFlagGuard` checking `ConfigService.get("FEATURE_STAGE_MANAGEMENT")`, applied per-controller). Rejected: leaks the route's existence via 401/403 instead of a true 404, and requires remembering to apply the guard to every new route the feature adds, rather than being enforced once at the module-registration level.
- **A single shared flag value** written once and read by both apps at runtime (e.g. an API endpoint the frontend polls). Rejected as over-engineered for a build-time, ops-controlled toggle — this is not a runtime experiment or per-user rollout, just a binary "is this feature ready" switch set by whoever deploys.
