# Campus Internship

Internship request & validation system for a university ("gestion des stages"), built as a personal project to learn NestJS, Prisma, and Zod. Students submit internship requests; one or two admins validate/refuse them and manage the referents assigned to students; the admin can extract data (host organism list, CSV export).

- **Stack**: NestJS (API) + React/Vite (web) + PostgreSQL + Prisma + Zod, TypeScript everywhere, pnpm workspaces monorepo.
- **Design docs**: [`docs/dataModel.md`](docs/dataModel.md), [`docs/businessRules.md`](docs/businessRules.md), [`docs/userFlow.md`](docs/userFlow.md), and the decision log in [`docs/adr/`](docs/adr/) are the source of truth for behavior. See [`CLAUDE.md`](CLAUDE.md) for the full set of repository conventions.

## Prerequisites

- **Node** ≥ 24 (see `.nvmrc`)
- **pnpm** 11.5.1 (see `packageManager` in `package.json`; enable via `corepack enable`)
- **Docker** (for local Postgres + MinIO via `docker compose`)
- **gitleaks** — native binary, not an npm dependency. Required for the pre-commit/pre-push secret-scanning hooks (ADR-0013) to actually scan instead of silently skipping.
  ```bash
  brew install gitleaks   # macOS
  # other platforms: https://github.com/gitleaks/gitleaks#installing
  ```

## Getting started

```bash
cp .env.example .env                       # then set JWT_SECRET, e.g. `openssl rand -base64 48`
pnpm install                               # also generates the Prisma client and sets up git hooks (Husky)
docker compose up -d                       # local Postgres (port 5433) + MinIO (port 9000)
pnpm --filter shared build                 # the API and the seed import the compiled `shared` package
pnpm --filter api run prisma migrate dev   # applies every migration, then runs the dev seed
pnpm dev                                   # API on http://localhost:3000, web on http://localhost:5173
```

Always invoke Prisma through `pnpm --filter api run prisma <subcommand>`: that script loads the root `.env` (and expands its `${POSTGRES_USER}`-style references) before calling the Prisma CLI, which a bare `prisma` / `exec prisma` does not.

`.env.example` turns the stage-management feature on (`FEATURE_STAGE_MANAGEMENT` / `VITE_FEATURE_STAGE_MANAGEMENT`, ADR-0029), as in production. Set both to `"false"` in `.env` to run the app without it.

### Demo accounts

The dev seed (`pnpm --filter api run db:seed`, also run automatically by `migrate dev`) creates about 20 student accounts, one set per profile status, all with the password `MotDePasseDemo2026!`. The full list is printed at the end of the seed. For example:

| Account                       | Profile status                      |
| ----------------------------- | ----------------------------------- |
| `marion.faure@etu.u-paris.fr` | `VALID` (can submit stage requests) |
| `amel.rahmani@etu.u-paris.fr` | `INCOMPLETE`                        |

There is no signup flow for the `ADMIN` role (ADR-0025). To try the admin side locally, grant it to a seeded account:

```bash
docker compose exec postgres psql -U stages -d stages \
  -c "UPDATE \"User\" SET roles = array_append(roles, 'ADMIN') WHERE email = 'amel.rahmani@etu.u-paris.fr';"
```

Then log in again with that account.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the API and web app in parallel |
| `pnpm lint` / `pnpm lint:fix` | ESLint across the monorepo |
| `pnpm format` / `pnpm format:check` | Prettier across the monorepo |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm -r test` | Run every workspace's unit test suite (no e2e) |
| `pnpm --filter api run test:e2e` | API e2e tests, on the dedicated `_test` database and `-test` bucket (created on first run, ADR-0030) |
| `pnpm test:all` | Unit tests, then API e2e tests (needs `docker compose up -d`) |
| `pnpm secrets:scan` | Full-history gitleaks scan |
| `pnpm --filter api run prisma migrate dev` | Apply/create a Prisma migration |
| `pnpm --filter api run db:seed` | Reset the dev seed accounts |
| `pnpm changeset` | Record a behaviour-changing change for release notes |

## Layout

```
apps/
  api/            # NestJS
  web/            # React + Vite
packages/
  shared/         # Zod value-objects, enums, API contracts (back <-> front)
docs/             # dataModel, businessRules, userFlow, ADRs
```

Contributing (commit convention, versioning, PR workflow) is documented in [`CONTRIBUTING.md`](CONTRIBUTING.md). Security policy is in [`SECURITY.md`](SECURITY.md). Licensed under [MIT](LICENSE).
