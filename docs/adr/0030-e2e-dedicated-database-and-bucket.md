# ADR-0030 — E2E tests run against a dedicated database and bucket

- Status: Accepted, amended by ADR-0034 (one database per Jest worker, cloned from this one)
- Date: 2026-09-19
- Deciders: project owner
- Related: ADR-0021 (bucket auto-provisioned outside production), ADR-0022 (CI services), ADR-0029 (feature flag the e2e suite has to switch on)

## Context

The e2e specs under `apps/api/test/` boot the real `AppModule` and write real rows and objects. Until now they ran against the same Postgres database and the same MinIO bucket as local development (`DATABASE_URL`, `S3_BUCKET`). Three problems followed:

- **Pollution.** Rows created by a run that was interrupted (Ctrl-C skips `afterAll`) or by a failing test stayed in the development database, next to the seeded students and the data entered by hand while testing the UI.
- **Cleanup as the only defence.** Correctness of the dev database depended on every spec deleting everything it created, in FK order (`Stage.studentId` and `Tutor.organismId` have no cascade).
- **Cross-talk.** A spec that asserted on a whole-table count raced against the other specs, which Jest runs in parallel workers, and against whatever was in the development database.

`CLAUDE.md` §9 already states that e2e tests "hit a real (test) database"; nothing provided one.

## Decision

**A dedicated database and a dedicated bucket, redirected through environment variables, with no change to production code.**

- `DATABASE_TEST_URL` points at a second database on the same Postgres server (`${POSTGRES_DB}_test`), and `S3_TEST_BUCKET` names a second bucket (`stages-files-test`). Both are declared in `.env.example`.
- `test:e2e` runs Jest through `dotenv-cli` (as the `prisma` script already does), so the `${...}` references are expanded.
- A Jest `setupFiles` entry (`test/helpers/e2e-env.ts`) sets `process.env.DATABASE_URL` and `process.env.S3_BUCKET` to those values in every worker before `AppModule` loads. `@nestjs/config` gives `process.env` priority over `.env`, so `PrismaService` and `FilesService` follow without any test-specific branch in `src/`.
- A Jest `globalSetup` (`test/helpers/global-setup.ts`) creates the test database if it doesn't exist (through the server's `postgres` maintenance database) and runs `prisma migrate deploy` against it, so the schema is always current, including right after a pull.
- A Jest `globalTeardown` empties the test bucket, so uploaded objects don't accumulate. The bucket itself needs no provisioning: `FilesService.onModuleInit` creates it outside production (ADR-0021).
- **Guard rails.** `readTestTargets()` runs in the global setup and in every worker and refuses to continue unless the database name ends in `_test` and the bucket name ends in `-test`. A wrong or missing variable fails before anything is written, and the teardown can only ever empty a bucket that is named as a test bucket.
- The specs keep a per-suite purge (`test/helpers/cleanup.ts`) in `afterAll`, so the test database stays empty between runs and the suites stay independent of each other. It is hygiene, no longer the safeguard for the development database.

The test database is not seeded. The e2e suite doesn't need `OrganismStructureType` rows: `structureType` is a free string validated by Zod, and the only route that reads the table (`GET /organisms/structure-types`) is asserted to return an array.

## Consequences

- Running the e2e suite can no longer alter the development database or its bucket, whatever state a previous run left the test targets in.
- CI needs no workflow change: it copies `.env.example` to `.env`, so both variables are present, and the Postgres service's superuser can create the second database.
- A new environment (fresh clone) needs nothing beyond the usual `cp .env.example .env`; the test database is created on the first `pnpm test:e2e`.
- Every e2e run applies migrations to the test database (a no-op when up to date), a small fixed cost.
- MinIO and Postgres are still shared servers: isolation is by database and bucket name, not by container.

## Alternatives considered

- **Keep the shared database and rely on cleanup** (the previous state, hardened with a stale-data sweep and a marker in test names). Rejected: it protects the development database only as long as cleanup succeeds, and interrupted runs need heuristics (age thresholds, name markers) to be recovered.
- **An ephemeral container per run** (Testcontainers or a second compose service). Rejected for now: stronger isolation, but a new dependency, slower runs, and a second Postgres to keep in sync with `docker-compose.yml` and the CI `services:` block, for a project that already runs one Postgres locally and in CI.
- **A separate schema in the same database** (`?schema=test`). Rejected: the Prisma migrations, `unaccent` extension and raw SQL in `OrganismsService` are all written against one schema, and a mistyped URL would still point at the development data; a separate database makes the `_test` suffix check meaningful.
