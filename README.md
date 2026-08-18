# Campus Internship

Internship request & validation system for a university ("gestion des stages") — a portfolio project. Students submit internship requests; one or two admins validate/refuse them and manage the referents assigned to students; the admin can extract data (host organism list, CSV export).

- **Stack**: NestJS (API) + React/Vite (web) + PostgreSQL + Prisma + Zod, TypeScript everywhere, pnpm workspaces monorepo.
- **Design docs**: [`docs/dataModel.md`](docs/dataModel.md), [`docs/businessRules.md`](docs/businessRules.md), [`docs/userFlow.md`](docs/userFlow.md), and the decision log in [`docs/adr/`](docs/adr/) are the source of truth for behavior. See [`CLAUDE.md`](CLAUDE.md) for the full set of repository conventions.

## Getting started

```bash
cp .env.example .env        # fill in local values
pnpm install                # also sets up git hooks (Husky)
docker compose up -d        # local Postgres + MinIO
pnpm --filter api exec prisma migrate dev
pnpm dev                    # runs apps/api and apps/web in parallel
```

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the API and web app in parallel |
| `pnpm lint` / `pnpm lint:fix` | ESLint across the monorepo |
| `pnpm format` / `pnpm format:check` | Prettier across the monorepo |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm -r test` | Run every workspace's test suite |
| `pnpm secrets:scan` | Full-history gitleaks scan |
| `pnpm --filter api exec prisma migrate dev` | Apply/create a Prisma migration |
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
