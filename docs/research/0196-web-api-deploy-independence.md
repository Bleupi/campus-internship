# Research: can web and API be deployed independently under the #194 deploy chain?

Source ticket: https://github.com/Bleupi/campus-internship/issues/196 (map #195, PRD #194)
Related: docs/adr/0022-cicd-scaleway-deployment.md, docs/adr/0029-feature-flag-module-gating.md, .github/workflows/deploy.yml, apps/web/Dockerfile, apps/api/Dockerfile, apps/api/docker-entrypoint.sh

## Short answer

**Yes.** Web and API can each be deployed alone, with one condition. The pipeline has to decide "what changed for service X" by diffing against **the commit service X last deployed successfully**, not against the previous commit on `main`. If it diffs against the previous commit, cancelling a pending run (which GitHub does by default) can lose an API deploy that a later web image already relies on.

- **Web-only deploy**: safe when the web code only calls API surface that is already live. It never needs the migration Job.
- **API-only deploy**: safe when the API change is backward-compatible with the web bundle already in production. It always comes with the migration Job (the Job runs the API image).
- **`packages/shared` (or root build input) change**: redeploy both, as the map already agreed. Order: migration Job, then API, then web.

## 1. How web depends on the API at runtime

| Coupling | Mechanism | Fixed when | Source |
| --- | --- | --- | --- |
| API location | `VITE_API_BASE_URL`, read once in `apps/web/src/lib/api-client.ts` and validated with `z.string().url()` | **Web build time.** It is a Docker `ARG` in `apps/web/Dockerfile`, filled from the repo variable `vars.VITE_API_BASE_URL` in `deploy.yml`. | Vite: values of `VITE_` variables "are bundled into your source code at build time", and `import.meta.env` constants are "statically replaced at build time" ([Vite env and mode](https://vite.dev/guide/env-and-mode)) |
| Allowed origin | `CORS_ORIGINS` on the API (`app.enableCors({ origin, credentials: true })`, `apps/api/src/main.ts`) | API container env (runtime) | repo |
| Request validation | Web imports Zod schemas from `shared`: `signupSchema`, `loginSchema`, `createReferentSchema`, `stagePeriodsSchema`, `listStagesQuerySchema`, and others. Web also imports domain helpers: `deriveSemester`, `getSubmissionBlockers`, `isBeforeCurrentSchoolYear`, `STAGE_CONFLICT_CODES`. | **Web build time.** `apps/web/Dockerfile` runs `pnpm --filter shared build` and then bundles it. | repo |
| Response shapes | `request<T>()` returns `response.json() as Promise<T>`. It is a **type cast only, with no runtime parsing.** | Compile time only | `apps/web/src/lib/api-client.ts` |
| Feature visibility | `VITE_FEATURE_STAGE_MANAGEMENT` (web, build time, dead-code-eliminated) and `FEATURE_STAGE_MANAGEMENT` (API, container env read at boot, module-graph gating) | Web: build. API: container start. | ADR-0029, `apps/web/src/lib/feature-flags.ts`, `apps/api/src/app.module.ts` |

Consequences:

- The API URL and CORS origin are stable custom-domain values (ADR-0022). Neither changes with a code deploy, so neither prevents deploying one service alone.
- The only real coupling is the **HTTP contract**: routes, request bodies and response fields. Both images bake their own copy of `shared` at build time. A deployed web and API can therefore run **different versions of `shared`**, and nothing checks for that at runtime.
- Response casts are tolerant one way and fragile the other. An extra field from a newer API is ignored. A field that is missing or renamed becomes `undefined` inside the UI, with no error thrown.

## 2. Compatibility matrix

The rows describe the API change. The columns describe which side is newer in production.

| API change | API newer, web older | Web newer, API older |
| --- | --- | --- |
| New route / new optional response field (additive) | OK. The old web never calls the route, and it ignores the extra field. | **Broken** if the web uses it. The route returns 404 (`ApiError`), or the field reads as `undefined`. |
| New *optional* request field | OK | OK. No `.strict()` object exists in `packages/shared` or `apps/api`, and Zod objects strip unknown keys by default. The old API therefore drops the field silently, which only matters if the web expects it to take effect. |
| New *required* request field / tightened validation in `shared` | **Broken**. The old web sends bodies that the API rejects with 400. | The new web validates more strictly than the API. That is harmless. |
| Loosened validation in `shared` | The old web is stricter than needed. That is harmless. | **Broken**. The new web lets input through that the old API rejects with 400. |
| Removed / renamed route or response field | **Broken** for the old web | n/a |
| Change behind a dark flag (ADR-0029) | OK while the web flag is off | OK while the web flag is off |
| Schema migration (DB only) | n/a. The web never touches the DB. | n/a |

The "API newer, web older" column is **not optional**, even in a both-services deploy, for two reasons:

1. The #194 chain updates the API before the web. A window always exists where the new API serves the old bundle.
2. Browser tabs that are already open keep running the bundle they loaded. `apps/web/nginx.conf` sets no cache headers and has no versioning check, so the old bundle stays in use until a reload, whatever the deploy order.

So the API must **already** stay backward-compatible with the previous web bundle (HTTP-level expand/contract). This is the same discipline #194 imposes on DB migrations, applied one layer up. Given that rule, an API-only deploy adds no new risk.

The "web newer, API older" column is the dangerous direction. The #194 chain prevents it inside one run (story 8: migration → API → web). A web-only deploy is safe exactly when the web code it ships uses no API surface that is not live yet.

## 3. Feature-flag ordering rule (ADR-0029)

- **Turning on**: the API flag goes first (container env plus a restart), then the web flag. That means a **web rebuild**, because the value is baked in. `deploy.yml` already says: "Turn a flag on here only after its API counterpart is on, so the UI never calls routes that still 404."
- **Turning off**: the reverse order. Web first, then the API.
- Selective-deploy impact: changing the repo variable `VITE_FEATURE_*` (or `VITE_API_BASE_URL`) **changes no file**. A path-based change detector will never see it, and changing a variable does not trigger a `push` run at all. A flag flip therefore needs a **manual web-only deploy path**, such as `workflow_dispatch` with a "force web" / "force api" input. That path is a legitimate single-service deploy and should be designed in, not treated as an exception.
- The API flag lives in the Scaleway container's env, not in CI. Flipping it is done outside `deploy.yml`, and code deploys do not affect it.

## 4. Does the migration Job run on a single-service deploy?

- **Web-only: no.** The web image holds no Prisma schema and no DB credential. The Job runs the **API** image (#194: "runs the API image with a command override that runs `prisma migrate deploy` against the schema shipped in the image"), so a web-only deploy has nothing new to migrate.
- **API-only: yes, always**, as the first step of the API's part of the chain. Prisma: "`migrate deploy` applies all pending migrations" ([Prisma CLI reference](https://www.prisma.io/docs/orm/reference/prisma-cli-reference)). The docs do not state what happens when no migration is pending. Inferred from "applies all pending migrations": nothing is applied and the run succeeds. Verify this in the #194 smoke scenario 1, which re-runs the command against an already-migrated DB.
  - A narrower option is to skip the Job unless `apps/api/prisma/migrations/**` changed since the last deployed API. That saves one DB wake-up per schema-less API deploy. It is **not recommended**: it adds a second change detector to keep correct, and an extra wake-up costs very little (ADR-0022 cost stance). Running the Job every time also keeps "the schema matches the deployed API image" true by construction.
- Expand/contract (#194, stories 21–23) guarantees that the *old* API keeps working on the *new* schema. A failure after the Job and before or during the API update is therefore safe, whether the deploy covers one service or both.

## 5. The cancellation trap (main finding)

GitHub concurrency: "any existing `pending` job or workflow in the same concurrency group will be canceled" and "the new queued job or workflow will take its place". This holds **regardless of `cancel-in-progress`**, which only also cancels the *running* one ([Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)). Today's `deploy.yml` (`cancel-in-progress: false`) already loses pending runs. That is harmless now only because every run deploys **both** services from `main` HEAD.

With selective deploy, take this sequence:

1. Merge A changes `apps/api` (new route) and `apps/web` (calls it). Run A is pending.
2. Merge B changes only `apps/web`. Run B is queued, and **run A is cancelled** (same group, or the per-service group for "web").
3. Run B diffs B against `B~1` (= A), sees "web only", and builds web from B. That build *includes A's web code*, because each image builds from the whole tree. Run B deploys web only.
4. Production now runs the new web against the old API, which has no route from A. This is the "web newer, API older" failure in the matrix.

The same trap exists with per-service concurrency groups, and with the map's rule that "the newest merge cancels pending runs touching the same service".

**Fix (condition for safety):** compute each service's change set as `diff(last_successfully_deployed_sha[service], HEAD)`, not `diff(HEAD~1, HEAD)`. A cancelled or failed run then simply leaves the service's baseline unchanged, and the next run picks up everything in between. Options for storing that baseline:

- the image reference currently set on the Scaleway container, read with `scw container container get`. This works today because images are tagged `:${{ github.sha }}`. Under #194's digest references, the SHA would have to be read some other way, for example from an OCI label or a container env/tag set at deploy time.
- the GitHub Deployments API, if the deploy job records one deployment per service and environment.

The first option is preferable because it reads what is actually running. The detail belongs to the axis-A design ticket.

## 6. Conditions for a safe single-service deploy

1. **Change detection against each service's last deployed SHA** (section 5), never against `HEAD~1`. If the baseline cannot be read, fall back to deploying both services.
2. **Path ownership.** These paths count for both services: `packages/shared/**`, `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` and `.dockerignore`. All of them are inputs to both Dockerfiles. These count for web only: `apps/web/**` (Dockerfile and `nginx.conf` included). These count for the API only: `apps/api/**` (Prisma schema and migrations included). Changes to `deploy.yml` itself should deploy both.
3. **The API stays backward-compatible with the deployed web bundle** (HTTP-level expand/contract). This already follows from deploy order and from open browser tabs. A removal or a stricter validation ships only after the web stops depending on the old behaviour.
4. **A web change ships only against API surface that is already live.** When it needs new API surface, the API part lands in the same merge (both deploy, in chain order) or in an earlier merge whose API deploy has completed. Condition 1 makes "completed" automatic.
5. **The migration Job is tied to the API**: always on an API deploy, never on a web-only deploy.
6. **Flag flips** follow ADR-0029 ordering, using a manual single-service deploy trigger, because a variable change produces no diff and no push.
7. **The order inside a both-services run stays migration → API → web**, with fail-fast. A failed API step leaves the web untouched, which is safe by condition 3.
