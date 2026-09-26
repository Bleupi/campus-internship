# ADR-0034 — E2E tests get one database per Jest worker

- Status: Accepted
- Date: 2026-09-26
- Deciders: project owner
- Related: ADR-0030 (dedicated test database and bucket, amended by this ADR)

## Context

ADR-0030 moved the e2e specs to a dedicated `_test` database and claimed that the per-suite purge in `afterAll` kept "the suites independent of each other". That holds only while spec files run one after another. Jest runs them in parallel workers, and every worker used the same database.

Some endpoints read rows across the whole table: `GET /admin/stage-requests` and `GET /referents` list every pending request or every referent, not only the calling spec's rows. When one spec file lists while another spec file's `afterAll` deletes its users, Prisma loads a `ReferentProfile` or a `Stage` and then fails to find the related `User` it points to. The error is `Inconsistent query result: Field user is required to return data, got null`, and the endpoint answers 500.

Measured locally on `main` (8446c20):

- The full parallel suite failed 10 runs out of 10 (`admin-stage-requests.e2e-spec.ts`).
- The same suite with `--runInBand` passed 3 runs out of 3.

Splitting spec files (PR #174) only changed how often the failure happens, because it changed the order in which files run.

## Decision

**Each Jest worker runs against its own database, cloned from the migrated test database at the start of every run.**

- The global setup (`test/helpers/global-setup.ts`) still creates the `_test` database if it is missing and runs `prisma migrate deploy` against it. That database is now only a template: no spec connects to it.
- For each worker (`1..globalConfig.maxWorkers`), the global setup drops the worker's database and recreates it with `CREATE DATABASE … TEMPLATE <test database>`. Postgres copies the files, so cloning is almost free.
- Worker databases are named `<base>_w<n>_test` (for example `stages_w1_test`), so they keep the `_test` suffix that `readTestTargets()` checks.
- `test/helpers/e2e-env.ts` points `DATABASE_URL` at `workerDatabaseUrl(databaseUrl, JEST_WORKER_ID)`. `JEST_WORKER_ID` is `1` under `--runInBand` too.
- Inside a worker, spec files run one after another, so two files never share a database at the same time. The per-suite purge stays as hygiene between the files of one worker.

## Consequences

- A spec can no longer read, count or trip over rows another spec file is writing or deleting at the same moment. Global-list endpoints are safe to assert on again.
- Every run starts every worker from an empty, migrated schema, whatever an interrupted run left behind. Before this ADR, leftovers stayed until a spec happened to purge them.
- The run time is unchanged (about 5 s in parallel locally).
- The Postgres server holds up to `maxWorkers + 1` test databases. They are recreated on every run and are never read outside the e2e suite.
- `DROP DATABASE … WITH (FORCE)` needs Postgres 13 or later. Local development and CI both run `postgres:16-alpine`.
- Nothing changes in production code, in CI configuration, or in `.env.example`.

## Alternatives considered

- **Run the suite serially (`--runInBand` / `maxWorkers: 1`).** Rejected: it is the simplest fix, but it makes every run about 2.7 times slower (14 s instead of 5 s) and the cost grows with the suite. It also hides the coupling instead of removing it.
- **Scope every assertion and every list endpoint call to the spec's own rows.** Rejected: the failure happens on the server, inside the query, before the test can filter anything. Only a global-list endpoint with a status filter could avoid it, and that would bend the API around the tests.
- **Purge only once, in the global teardown, instead of in each `afterAll`.** Rejected: it removes the deletes that happen mid-run, but specs still see each other's rows. Any count, ordering or "absent from the list" assertion would still depend on which other files ran at the same time.
- **One Postgres schema per worker (`?schema=w1`).** Rejected for the same reasons ADR-0030 rejected a test schema: the migrations, the `unaccent` extension and the raw SQL assume a single schema. It would also mean running `migrate deploy` once per worker instead of cloning once.
- **Testcontainers (one Postgres container per worker).** Rejected, as in ADR-0030: a new dependency and much slower start-up, when one server with several databases already gives the isolation needed.
