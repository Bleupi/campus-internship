# ADR-0022 — CI/CD and Scaleway deployment: Serverless Containers + a private database

- Status: Accepted
- Date: 2026-08-27
- Deciders: project owner

## Context

The project needs to go live as soon as the first feature (student account creation + profile completion/edit, issue #11) is ready, ahead of the first-week-of-September 2026 deadline. Nothing exists yet: no `.github/workflows/` (no CI at all), no `Dockerfile` anywhere, and `docker-compose.yml` is dev-only (Postgres + MinIO, no app service). `CONTRIBUTING.md` describes an intended changesets-driven release workflow (§11, ADR-0015), but no workflow file implements it — it's aspirational documentation, not running automation.

This ADR settles three things at once, reached through a structured design session: the shape of the merge CI, the shape of the deploy CI, and which Scaleway resources back the app in production.

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
4. Database migration (`prisma migrate deploy`) is **not** a CI step run from the runner — it runs inside the API container's own entrypoint, before the Nest server starts listening. See "Database network exposure" below for why.
5. Secrets: GitHub Actions Secrets hold CI-side values only (Scaleway IAM deploy key, registry credentials). The database connection string is **not** one of them — see below.

### Scaleway resources

| Concern | Choice |
| --- | --- |
| Region | `fr-par` (Paris) — most mature region, lowest latency for a French user base |
| API compute | Serverless Containers |
| Web compute | Serverless Containers (second container; not Object Storage + Edge Services — see "Rejected" below) |
| Database | Managed Database for PostgreSQL, smallest instance, on a Private Network, **no public endpoint** |
| File storage | Object Storage (unchanged — ADR-0020/0021 already established this) |
| Registry | Scaleway Container Registry |
| Domain | A subdomain (`stages.<domain>`, domain TBD) attached directly to each Serverless Container, TLS via Scaleway's built-in managed Let's Encrypt — no CDN needed |

Cost stance throughout: minimize cost, cold starts accepted (API and, more rarely, web scaling from zero costs a few seconds on the first request after idle) — see "Rejected: warm instance" below for the fallback if this becomes a real problem.

### Database network exposure

The Managed Database's public endpoint is **removed entirely**, not just IP-allowlisted — it is unreachable from the public internet under any circumstance, valid credentials or not. This follows directly from the threat model driving this decision: continuous, automated internet-wide scanning against any open database port is a given, and credential leakage is treated as a "when," not an "if."

Consequences of this choice:

- `prisma migrate deploy` cannot run from a GitHub-hosted CI runner (no network route to a Private Network) — hence it runs inside the API container's entrypoint instead, the container being attached to the same Private Network as the database.
- The database connection string is configured **once, directly on the Scaleway container**, and is never passed through a GitHub Actions secret — the CI-side secret surface excludes the DB credential entirely. A leaked CI secret cannot be used to reach the database, because the database has no route reachable from wherever CI runs.
- Prisma's own advisory lock protects against a migration race if Scaleway ever runs more than one API container instance concurrently during a deploy.

### Operational runbook — temporary database access (manual inspection / ad hoc backup)

No bastion host for V1 (see "Deferred" below) — instead, a deliberate, narrow, self-administered exception each time manual access is needed:

1. **Find your current public IP** (e.g. `curl ifconfig.me`). If you're not on a fixed IP, expect to repeat this step next time — a stale allowlist entry silently stops working, it doesn't fail loudly.
2. **Re-attach a public endpoint** to the Database Instance from the Scaleway console (Databases → instance → Endpoints) — the reverse of the removal above.
3. **Immediately restrict it**: Database Instance → Settings → Allowed IP addresses → replace the default `0.0.0.0/0` with `<your-ip>/32`. Never leave the default (open to the world) active, even briefly.
4. **Connect and do the work** — `psql`, DBeaver, or `pnpm --filter api run prisma studio` against the public endpoint's connection string; run the `pg_dump` or inspection needed.
5. **Close it back down immediately after**: remove the public endpoint again (not just clear the IP list — an allowlist only restricts an endpoint that still exists; removing the endpoint is what returns the database to fully private).

Treat steps 2–4 as a deliberate, time-boxed exception every time, never a standing access mode.

## Consequences

- No staging environment: the merge-CI e2e suite and the manual approval gate are the only safety nets before production. A regression class neither covers (e.g. an environment/config-only issue) can still reach prod — accepted given the timeline.
- Cold starts are a known, accepted UX cost at current traffic levels. If this becomes noticeable in practice, the documented fallback is pinning `min_scale=1` on the affected container — a config change, not an architecture change.
- A failed migration's logs are interleaved with the API container's boot logs (not isolated in a dedicated CI step), since migration now runs at container startup rather than as its own pipeline stage.
- Switching database products later (e.g. back to Serverless SQL Database) is a plain Postgres dump/restore + connection-string swap at the data layer — but very likely also a security regression given that product's networking model (see below). Any future switch away from Managed Database should re-open this ADR's threat-model discussion, not be treated as a drop-in swap.

## Alternatives considered

- **Serverless SQL Database** (Scaleway's newer, scale-to-zero, pay-per-use Postgres-compatible product) instead of Managed Database. Rejected: it has confirmed automated daily backups and appears to be GA, but Scaleway's own documentation shows **no Private Network / VPC attachment** for this product — no how-to page, a direct 404 on the URL pattern every comparable product uses, no mention in concepts/FAQ/overview body text. It can only ever expose a public endpoint protected by credentials alone, which the threat model above rules out, even though it's cheaper and otherwise fits this project's general cost-minimizing bias.
- **Scaleway Serverless Jobs** for the one-off migration (triggered from CI via Scaleway's control-plane API, executing inside Scaleway's network). Rejected: Scaleway's FAQ states Serverless Jobs does not currently support Private Networks/VPC ("under development", unshipped) — a job launched this way could not reach a Private-Network-only database. Worth revisiting if Scaleway ships this.
- **`prisma migrate deploy` from the GitHub Actions runner**, against a publicly-reachable database (with or without an IP allowlist). Rejected once the database moved to Private-Network-only: GitHub-hosted runners egress from large, dynamic IP ranges shared by every GitHub Actions user worldwide — an allowlist permissive enough to let CI connect would already be too broad to meaningfully protect against a leaked credential, defeating the point of allowlisting at all.
- **Object Storage + Scaleway Edge Services (CDN)** for the web frontend, instead of a second Serverless Container. Rejected: an Object Storage bucket alone can serve a custom-domain CNAME but not HTTPS on it — HTTPS-on-custom-domain requires Edge Services in front, a second product to learn and configure for a marginal cost difference over reusing the Serverless Containers mechanism already needed for the API (Serverless Containers has no per-request charge and a monthly free vCPU-s/GB-s pool a low-traffic static-file container stays well within).
- **A bastion host** for ad hoc human access to the private database. Deferred, not rejected outright — more robust (zero exposure window at all) but adds a resource to create/start/stop for what's currently an infrequent need. The temporary-whitelist runbook above was chosen for V1; revisit if manual DB access becomes frequent.
- **Deploy triggered by a changesets release tag** rather than every merge to `main`. Rejected for V1: would require the changesets release-automation workflow (itself unimplemented — `CONTRIBUTING.md` describes it as intent only, ADR-0015) to be built correctly _before_ a single deploy could happen — two new systems to get right simultaneously under a tight deadline. Revisit once both exist independently and are proven.
- **A staging environment** in addition to production. Rejected for V1 on cost/time grounds — the manual-approval gate is the compensating control instead.
- **A warm (`min_scale=1`) API/web container** to avoid cold starts entirely. Rejected as the default — a few euros/month of fixed cost for a benefit (no cold start) not worth paying for at current traffic. Documented as the fallback if cold starts prove disruptive in practice.

## Related

Builds on `ADR-0020` (S3 client) and `ADR-0021` (bucket lifecycle) for file storage, unaffected by this decision. Assumes `ADR-0010` (no Turborepo) and `ADR-0016` (`packages/shared` build step) for how merge CI builds the monorepo. The changesets release automation referenced in `CONTRIBUTING.md` (`ADR-0015`) remains unimplemented and is explicitly out of scope here — a future ADR should cover tying deploy triggers to it, if that's revisited.
