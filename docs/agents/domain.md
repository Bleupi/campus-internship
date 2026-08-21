# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repo predates the `CONTEXT.md` convention and already has its own domain docs, mandated by `CLAUDE.md` §2 — read them in this order:

1. `docs/dataModel.md` — schema, single source of truth for entities.
2. `docs/businessRules.md` — numbered rules (`BR-xx`), each maps to a testable unit.
3. `docs/userFlow.md` — behavior from the user's point of view.
4. `docs/adr/` — the _why_ behind structuring decisions. Read the ones relevant to the area being touched before proposing a design that might re-litigate them.

If a `CONTEXT.md` shows up later (created lazily by `/domain-modeling`), read it too and prefer its vocabulary. Until then, `docs/dataModel.md` and `docs/businessRules.md` are the glossary.

`docs/ROADMAP_V2.md` is explicitly out of scope — ideas parked there must never be implemented unless the user asks for the V2 milestone by name.

## File structure

Single-context repo (this repo, despite being a pnpm monorepo):

```
/
├── docs/
│   ├── dataModel.md
│   ├── businessRules.md
│   ├── userFlow.md
│   ├── ROADMAP_V2.md   ← out of scope
│   └── adr/
│       ├── 0001-rbac-central-user.md
│       └── ...
├── apps/api
├── apps/web
└── packages/shared
```

`apps/api`, `apps/web`, and `packages/shared` are separate pnpm packages (ADR-0010), but the domain docs describe the whole system, not a per-package slice — so this stays single-context rather than one `CONTEXT.md` per package. Revisit only if a package grows its own genuinely independent domain.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/dataModel.md` / `docs/businessRules.md` — e.g. `BR-04b`, `ReferentAssignment`, `schoolYear`, `Stage.snapshot`. Don't drift to synonyms.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag doc/ADR conflicts

`CLAUDE.md` itself states that the specs win over `CLAUDE.md` if they conflict. If your output contradicts an existing ADR or one of `docs/dataModel.md` / `docs/businessRules.md` / `docs/userFlow.md`, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0014 (referent assignment key) — but worth reopening because…_
