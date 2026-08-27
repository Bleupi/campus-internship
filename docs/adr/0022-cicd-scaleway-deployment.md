# ADR-0022 — CI/CD and Scaleway deployment: Serverless Containers + a Serverless SQL Database

- Status: Accepted
- Date: 2026-08-27
- Deciders: project owner

## Context

The project needs to go live as soon as the first feature (student account creation + profile completion/edit, issue #11) is ready, ahead of the first-week-of-September 2026 deadline. Nothing exists yet: no `.github/workflows/` (no CI at all), no `Dockerfile` anywhere, and `docker-compose.yml` is dev-only (Postgres + MinIO, no app service). `CONTRIBUTING.md` describes an intended changesets-driven release workflow (§11, ADR-0015), but no workflow file implements it — it's aspirational documentation, not running automation.

This ADR settles three things at once, reached through a structured design session: the shape of the merge CI, the shape of the deploy CI, and which Scaleway resources back the app in production.

**This revises the original version of this decision**, reached in the same design session, which chose a Managed Database for PostgreSQL on a Private Network with no public endpoint. That option was reconsidered on cost grounds before merge: even its cheapest shared-vCPU tier runs €79–137/month as a fixed cost, for a project whose actual traffic (1–2 admins, a modest cohort of students, sporadic usage) doesn't come close to justifying an always-on instance. The Serverless SQL Database's scale-to-zero pricing brings that down to an estimated few euros a month — but that product has no Private Network attachment, so choosing it means deliberately reopening and re-deciding the database threat model, not just swapping a resource name. That re-decision, and the mitigations it required, are recorded below.

## Decision

### Environment & deploy trigger

- **Production only** for V1 — no staging environment. Doubling CI config and Scaleway resources for a single-feature launch isn't worth it under this timeline; see "Rejected: staging environment" below for the compensating control.
- **Deploy pipeline auto-starts on merge to `main`**, but the step that actually touches production is gated behind a **manual approval** (a protected GitHub `production` Environment with a required reviewer — the project owner). This gives most of the safety of a staging environment (nothing reaches prod without an explicit human decision) without needing to build a second environment's worth of infrastructure first.

### Merge CI (every PR)

Runs, in order: lint, typecheck, build (`packages/shared` first, per ADR-0016), unit tests, and **e2e tests** against real Postgres + MinIO started as GitHub Actions `services:` containers. E2e is included from day one, not deferred — with no staging environment, the e2e suite is the only integration safety net before a human approves a production deploy.

### Deploy CI (on merge to `main`, gated by manual approval)

1. Build and push two Docker images to Scaleway Container Registry:
   - **API** (`apps/api`, NestJS).
   - **Web** (`apps/web`'s Vite `dist/` build, served by a minimal nginx/`serve` image).
2. Wait for manual approval (see above).
3. Deploy both images as Scaleway Serverless Containers.
4. Database migration (`prisma migrate deploy`) is **not** a CI step run from the runner — it runs inside the API container's own entrypoint, before the Nest server starts listening, using a separate migration-only credential (DDL-capable) that the running Nest process never holds. Unlike the original version of this decision, running migration outside CI is no longer forced by network reachability (the Serverless SQL Database has a public endpoint reachable from anywhere, including a GitHub-hosted runner) — it's now a deliberate choice to keep both database credentials out of GitHub Actions Secrets entirely. See "Database credential exposure & mitigations" below.
5. Secrets: GitHub Actions Secrets hold CI-side values only (Scaleway IAM deploy key, registry credentials). Neither database credential (migrate or runtime) is one of them — see below.

### Scaleway resources

| Concern | Choice |
| --- | --- |
| Region | `fr-par` (Paris) — most mature region, lowest latency for a French user base; also the only region the Serverless SQL Database is currently available in |
| API compute | Serverless Containers |
| Web compute | Serverless Containers (second container; not Object Storage + Edge Services — see "Rejected" below) |
| Database | **Serverless SQL Database**, scale-to-zero (`min_scale=0`), authenticated via dedicated IAM Applications' API keys (not a plain Postgres password) — two separate keys, split by privilege (see "Database credential exposure & mitigations") |
| File storage | Object Storage (unchanged — ADR-0020/0021 already established this) |
| Registry | Scaleway Container Registry |
| Domain | A subdomain (`stages.<domain>`, domain TBD) attached directly to each Serverless Container, TLS via Scaleway's built-in managed Let's Encrypt — no CDN needed |

Cost stance throughout: minimize cost, cold starts accepted. This now extends to the database: `min_scale=0` means the database itself can cold-start on the first request after idle, in addition to the already-accepted API/web container cold starts — the two can stack on a genuinely cold first request. At this project's traffic level, the estimated monthly database cost lands at a few euros (compute billed only while active, plus storage at ~€0.20/GB/month with 7 days of automated backups included) — a small fraction of even the cheapest always-on Managed Database tier. See "Rejected: warm instance" below for the fallback if cold starts prove disruptive.

### Database credential exposure & mitigations

The Serverless SQL Database has no Private Network attachment and no IP allowlist today — both are on Scaleway's roadmap but not shipped. Its endpoint is reachable from the public internet, protected only by the credential used to connect. This directly reopens the threat model the original version of this ADR was built to avoid: continuous, automated internet-wide scanning against any open database port is a given, and credential leakage is treated as a "when," not an "if." Where the original decision made a leaked credential harmless (no network route existed at all), this decision cannot — the mitigations below reduce the blast radius and the exposure window, they don't eliminate the risk the way network isolation did. That trade is accepted here specifically because of this project's scale and stakes (a portfolio project, low traffic, no real financial data); it should be revisited if either changes materially.

Mitigations adopted:

- **Authentication is a Scaleway IAM API key, not a Postgres password.** The connection string's user/password pair is an IAM Application's access key ID and secret key (`postgres://<app-id>:<secret-key>@<host>.pg.sdb.fr-par.scw.cloud:5432/<db>?sslmode=require`). This is structurally different from a database-native password: it's managed and revocable through Scaleway IAM, independently of the database itself.
- **Two dedicated, non-personal IAM Applications, split by privilege — not one shared credential:**
  - `campus-internship-api-migrate`, granted the `ServerlessSQLDatabaseReadWrite` permission set (data **and** table-structure changes). Used only by the API container's entrypoint script to run `prisma migrate deploy`, then never touched again for the rest of that container's life.
  - `campus-internship-api-runtime`, granted the narrower `ServerlessSQLDatabaseDataReadWrite` permission set (data only — no `CREATE`/`ALTER`/`DROP TABLE`). Used by the running Nest process for every request it serves. A leak of the runtime credential — the one actually exposed to a live, request-serving process for its entire uptime — cannot be used to alter schema. The migrate credential, which can, is never held by that long-running process at all, only invoked briefly at boot.
- Neither Application is the project owner's own account, and neither Policy grants anything beyond this one database — a leak of either key doesn't expose Object Storage, the Container Registry, or anything else in the account.
- **TLS is enforced** (`sslmode=require`) on every connection.
- **Centralized, instant revocation.** Because each credential is an IAM key rather than a database role's password, a suspected leak is closed by deleting that key in IAM — no database-side change, no downtime beyond issuing and deploying a replacement key.
- **Scheduled rotation**, not just reactive: both keys are rotated periodically (e.g. quarterly) as routine hygiene, not only when a leak is suspected.
- **Least-privilege at the Postgres role level too**, as a finer-grained layer underneath the IAM split above: IAM's `DataReadWrite` permission set restricts the runtime credential to DML across the database, but doesn't scope it to specific tables — the runtime role's own Postgres grants should still be limited to the application's schema, no more.

What this deliberately does not attempt: an IP allowlist or network-level barrier, since neither exists yet for this product. If Scaleway ships Private Network support for the Serverless SQL Database, revisit this section — it would let the network-isolation posture of the original decision be restored without changing database products again.

### Operational runbook — manual database access (inspection / ad hoc backup)

Because the endpoint is always reachable (there's no "detach the public endpoint" step to perform or reverse, unlike a Private-Network-only database), manual access is simpler than the original decision's runbook, at the cost of having no network barrier to fall back on:

1. **Create a short-lived, personal-use IAM Application and API key**, scoped to this database only — do not reuse the application's own production key for manual work, so the two blast radii stay separate.
2. **Connect and do the work** — `psql`, DBeaver, or `pnpm --filter api run prisma studio` against the Serverless SQL Database's connection string with that key, over TLS.
3. **Revoke the key immediately after** — deleting it in IAM closes access instantly; there is no separate "close the endpoint" step to remember, since the endpoint was never opened or closed in the first place.

Treat step 1–3 as a deliberate, time-boxed exception every time, never a standing access mode — the same discipline as the original runbook, just without a network toggle to enforce it.

## Consequences

- **No network isolation for the database, by product limitation, not by choice within it.** The mitigations above narrow who could plausibly reach it (nobody without the current IAM key) and how long a leaked key stays useful (until the next scheduled rotation or a revocation), but they do not remove the public reachability itself the way the original decision's Private Network did. Accepted for this project's scale; revisit if that scale changes.
- **Cost drops substantially** versus the original decision — an estimated few euros a month at `min_scale=0`, versus a fixed €79+/month for even the cheapest Managed Database tier realistically positioned for production use.
- **Cold starts can now compound**: a genuinely cold request may pay both the API container's cold start and the database's own wake-from-zero latency. Still accepted under the same cost-minimizing stance as the container cold starts, but worth watching in practice.
- **Two database credentials to provision and rotate instead of one** (migrate + runtime), a small added operational cost in exchange for the running application process never holding schema-altering rights.
- **Migration-in-entrypoint is now a deliberate secret-hygiene choice, not a network necessity** — a side effect worth noting: because it's no longer coupled to network reachability, switching the migration path again later (e.g. to a dedicated CI step) is a smaller, more isolated change than it would have been under the original decision.
- No staging environment: the merge-CI e2e suite and the manual approval gate are the only safety nets before production. A regression class neither covers (e.g. an environment/config-only issue) can still reach prod — accepted given the timeline.
- A failed migration's logs are interleaved with the API container's boot logs (not isolated in a dedicated CI step), since migration runs at container startup rather than as its own pipeline stage.
- **Related, but not a substitute for the above**: a V2 feature (see `docs/ROADMAP_V2.md`) will require university email verification at student account creation. That narrows who can obtain a valid _application-level_ account, which is a real access-control improvement — but it has no bearing on the database credential itself, which only the API process ever holds and which no end user, verified or not, is ever exposed to. Don't conflate the two when reasoning about this ADR's residual risk.

## Alternatives considered

- **Managed Database for PostgreSQL on a Private Network, no public endpoint** — the original version of this decision. Rejected on cost grounds: its cheapest tier realistically positioned for production (`PRO2-XXS`, shared vCPU) runs ~€79/month fixed, regardless of actual usage, which doesn't fit this project's traffic or its cost-minimizing stance elsewhere in this same ADR. Its genuine advantage — no network route to the database exists even with a leaked credential — is real and is what's given up here; see "Database credential exposure & mitigations" above for how that gap is narrowed instead of closed. Revisit if traffic or stakes grow enough that the trade flips back.
- **Scaleway Serverless Jobs** for the one-off migration (triggered from CI via Scaleway's control-plane API, executing inside Scaleway's network). Rejected: Scaleway's FAQ states Serverless Jobs does not currently support Private Networks/VPC ("under development", unshipped) — moot for a database with no Private Network to reach either way, but also no simpler than running the migration in the container's own entrypoint, which is already required regardless.
- **`prisma migrate deploy` from the GitHub Actions runner**, directly against the Serverless SQL Database's public endpoint. Technically possible now (the original rejection reason — no network route from a GitHub-hosted runner — no longer applies to this database). Still rejected: it would require putting the database credential into GitHub Actions Secrets, widening exactly the secret surface the mitigations above are trying to keep narrow. Migration stays in the API container's entrypoint instead.
- **Object Storage + Scaleway Edge Services (CDN)** for the web frontend, instead of a second Serverless Container. Rejected: an Object Storage bucket alone can serve a custom-domain CNAME but not HTTPS on it — HTTPS-on-custom-domain requires Edge Services in front, a second product to learn and configure for a marginal cost difference over reusing the Serverless Containers mechanism already needed for the API (Serverless Containers has no per-request charge and a monthly free vCPU-s/GB-s pool a low-traffic static-file container stays well within).
- **A bastion host** for ad hoc human access to the database. Not applicable to this decision in its original form (there's no private network to bastion into), and unnecessary in this decision's form too — the endpoint is already reachable, so a bastion would add a resource without adding a capability. The IAM-key runbook above serves the same need.
- **Deploy triggered by a changesets release tag** rather than every merge to `main`. Rejected for V1: would require the changesets release-automation workflow (itself unimplemented — `CONTRIBUTING.md` describes it as intent only, ADR-0015) to be built correctly _before_ a single deploy could happen — two new systems to get right simultaneously under a tight deadline. Revisit once both exist independently and are proven.
- **A staging environment** in addition to production. Rejected for V1 on cost/time grounds — the manual-approval gate is the compensating control instead.
- **A warm (`min_scale=1`) API/web container, and a non-zero `min_scale` on the database**, to avoid cold starts entirely. Rejected as the default — `min_scale=1` on the database alone is estimated at ~€99/month compute, more than the Managed Database alternative this ADR rejected on cost grounds in the first place, which would defeat the point. Documented as the fallback if cold starts (container or database) prove disruptive in practice, to be evaluated independently for each resource rather than assumed.

## Related

Builds on `ADR-0020` (S3 client) and `ADR-0021` (bucket lifecycle) for file storage, unaffected by this decision. Assumes `ADR-0010` (no Turborepo) and `ADR-0016` (`packages/shared` build step) for how merge CI builds the monorepo. The changesets release automation referenced in `CONTRIBUTING.md` (`ADR-0015`) remains unimplemented and is explicitly out of scope here — a future ADR should cover tying deploy triggers to it, if that's revisited. The V2 university-email-verification feature noted in "Consequences" above is tracked in `docs/ROADMAP_V2.md` — related to this ADR's residual risk discussion, but a separate, application-level control, not an infrastructure mitigation.
