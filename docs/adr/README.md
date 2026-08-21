# Architecture Decision Records

Every structuring decision is recorded here as an ADR. Format: lightweight [MADR](https://adr.github.io/madr/). Files are numbered and never rewritten once Accepted — a later decision that changes an earlier one is a new ADR that `Supersedes` it.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-rbac-central-user.md) | RBAC with a central User and multiple roles | Accepted |
| [0002](0002-no-admin-profile-v1.md) | No AdminProfile in V1 (YAGNI) | Accepted |
| [0003](0003-stage-snapshot.md) | Single Stage table with immutable versioned snapshot | Accepted |
| [0004](0004-student-profile-state-machine.md) | Student profile state machine | Accepted |
| [0005](0005-file-storage-bucket.md) | Files in a bucket, metadata in DB, 1-N FileObject | Accepted |
| [0006](0006-service-text-then-table.md) | Service as text in V1, OrganismService in V2 | Accepted |
| [0007](0007-optimistic-locking.md) | Optimistic locking for stage concurrency | Accepted |
| [0008](0008-stage-periods.md) | Multiple work periods via StagePeriod | Accepted |
| [0009](0009-half-open-temporal-intervals.md) | Temporal bounds as half-open intervals `[start, end)` | Accepted |
| [0010](0010-monorepo-pnpm-workspaces.md) | Monorepo with pnpm workspaces (Turborepo deferred) | Accepted |
| [0011](0011-semester-enum-derived.md) | `Semester` as a Prisma/Postgres enum, derived from periods | Accepted |
| [0012](0012-schoolyear-value-object.md) | `schoolYear` as a shared Zod value-object + DB `CHECK` | Accepted |
| [0013](0013-open-source-security-git-hooks.md) | Open-source (MIT), secret-scanning, and Git hooks | Accepted |
| [0014](0014-referent-assignment-key.md) | Referent assignment keyed on (student, schoolYear, semester, mandatory) | Accepted |
| [0015](0015-conventional-commits-semver-changesets.md) | Conventional Commits + SemVer 2.0.0, releases via Changesets | Accepted |
| [0016](0016-shared-package-build-step.md) | `packages/shared` ships a compiled CommonJS build | Accepted |
| [0017](0017-design-system-mui.md) | Design system: MUI, bordeaux/gold theme | Accepted |
