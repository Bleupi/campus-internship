# Research: architecture visualization tools — macro, micro, blast radius

Source ticket: https://github.com/Bleupi/campus-internship/issues/202 (map #195, feeds prototype #207)

Question: which tools can render this codebase's architecture at macro and micro level, plus a PR's blast radius (changed files + transitive dependents + layers crossed `api ↔ shared ↔ web`), and where should the output live (committed Mermaid, CI artifact, GitHub Pages, PR comment)?

Versions and publish dates below come from the npm registry (`npm view <pkg> version time.modified`, queried 2026-10-12).

## Repo size (what the graph has to stay readable at)

Counted on `origin/main` at the time of writing:

| Package | `.ts`/`.tsx` files | of which non-test |
| --- | --- | --- |
| `apps/api/src` | 78 | 55 |
| `apps/web/src` | 124 | 102 |
| `packages/shared/src` | 37 | 37 (tests excluded) |

- Macro units: **9 Nest modules** (`admin`, `auth`, `files`, `health`, `mailer`, `organisms`, `referents`, `stages`, `students`), **7 web features** (`admin`, `auth`, `dashboard`, `organisms`, `referents`, `stages`, `students`, with 24 sub-folders), and `shared` (`schemas/`, `enums/`, `contracts/`).
- Edges: about **475 relative-import lines** across the three packages, plus **72 non-test files importing `shared`** (29 in api, 43 in web).
- Readability consequence: a whole-repo file-level graph has around 200 nodes and 500 edges. That is at Mermaid's default `maxEdges` of **500** ("Defines the maximum number of edges that can be drawn in a graph") and close to `maxTextSize` 50000 ([Mermaid config schema](https://mermaid.js.org/config/schema-docs/config.html)). So a **static** whole-repo view has to be collapsed to folders. A file-level view only works when filtered (focus or blast radius) or **interactive** (expand and collapse).

## Tools

### dependency-cruiser — the strongest fit

- Status: MIT, about 7.3k stars ([repo](https://github.com/sverweij/dependency-cruiser)). v18.6.0 was published 2026-10-11, so it is actively maintained. It needs Node `^22||^24||>=26`, and the repo uses Node 24. It supports TypeScript `>=2 <7` as a parser.
- **Blast radius is built in:**
  - `--affected [revision]` means "Only include modules changed since the revision + all modules that can reach them". The revision defaults to `main`. The option is "syntactic sugar" around `--reaches`, whose stated purpose is to "analyze what modules will directly or indirectly be affected by a change you make" ([CLI docs](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)).
  - `--highlight <regex>` marks modules without filtering anything. Only the dot reporters and the mermaid reporter support it. The docs say it "can be more effective than using the `--reaches` option" for showing changed modules, paired with the author's [watskeburt](https://github.com/sverweij/watskeburt), which prints a regex of the files changed since a revision (MIT).
- **Macro and micro from one tool** ([CLI docs](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md), [options reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md)):
  - Macro: `--collapse <depth|regex>` works for all reporters. `archi`/`ddot` summarise to folders. A collapse regex on `apps/api/src/modules/[^/]+` and `apps/web/src/features/[^/]+` would give a module/feature-level graph of about 17 nodes.
  - Micro: `--focus <regex>` with `--focus-depth` shows a module and its direct neighbours. The default depth of 1 means "direct neighbours only".
  - Reporters: `mermaid` ("GitHub and GitLab support this out of the box"), `dot`, `archi`, `ddot`, `flat`, `dot-webpage`, `html` (a dependency matrix), `markdown`, `text`, and `json`. `json` is the input for any custom interactive renderer.
  - Note: `dot-webpage` "pipes it through the GraphViz `dot` command", so it needs Graphviz installed on the runner.
- **Layer rules** ([rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)): `forbidden` rules use `from`/`to` path regexes. They can express "`shared` must not import `apps/*`", "web must not import api", `circular`, and `orphan`. Severity `error` gives a non-zero exit through the `err` reporter. Per the map's one-blocking-owner principle, decide whether depcruise or ESLint owns the layer-boundary gate.
- Monorepo caveats for #207:
  - `combinedDependencies` (default `false`) handles per-package `package.json`.
  - `tsConfig` reads only `compilerOptions` and follows `extends`.
  - **`shared`'s `package.json` `exports` point to `./dist`**. Without a build, the cruiser cannot resolve `from 'shared'` back to `packages/shared/src`. #207 has to build `shared` first, or map it to source through `enhancedResolveOptions`/tsconfig paths. Otherwise the api ↔ shared ↔ web edges, which are the whole point of "layers crossed", disappear.

### madge — reject

- MIT, about 10.2k stars ([repo](https://github.com/pahen/madge)). The last npm publish was **v8.0.0 on 2024-08-05**, about 26 months old. The maintainer asks for funding, and the repo has 118 open issues.
- Output is image/SVG/DOT, which needs Graphviz, or JSON. It also does circular detection.
- It has no blast-radius or `affected` mode, no folder-collapse reporter, no Mermaid output and no rule engine. Everything it does, dependency-cruiser also does, and dependency-cruiser is maintained.

### Nest module graph (DI level, not import level)

File imports and the Nest module graph (`@Module({ imports })`) are different graphs. A file import between modules does not prove a Nest `imports` edge, and the reverse is also true.

- **nestjs-spelunker**:
  - MIT, about 416 stars, v1.3.2. The last publish was **2025-01-26**, and the README says it is "in early development" ([repo](https://github.com/jmcdo29/nestjs-spelunker)).
  - `SpelunkerModule.explore(app)` → `graph()` → `findGraphEdges()` gives module edges that are easy to map to Mermaid (its README example prints `graph LR` + `A-->B`).
  - It needs an app built with `NestFactory.create` or `createApplicationContext`. It doesn't need to listen, but every provider gets instantiated, so DB and S3 clients must not connect eagerly. That ties into PRD #194's lazy DB start.
- **Nest Devtools** ([overview](https://docs.nestjs.com/devtools/overview)):
  - `@nestjs/devtools-integration` is MIT (v12.0.0, 2026-08-27).
  - With `snapshot: true`, `app.get(SerializedGraph).toString()` writes a `graph.json` that can be dropped into the hosted Devtools UI "offline" (preview mode).
  - But the **CI/CD integration (graph diff per build, PR status) "is available on the Enterprise plan"** ([CI/CD integration](https://docs.nestjs.com/devtools/ci-cd-integration)). No official price page was found.
  - The viewer is a hosted third-party UI, not something that can live in the repo.
  - **Reject for CI.** It is paid, and the map's budget rule ("a paid tool only if its benefit is major") isn't met when the free options cover the need.
- Cheaper alternative: a dependency-cruiser collapse to `modules/*` gives an **import-level** module graph with no app bootstrap. It is not DI-exact.

### Renderers

- **Mermaid**:
  - GitHub renders it natively "in GitHub Issues, GitHub Discussions, pull requests, wikis, and Markdown files" ([GitHub docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)), so there is nothing to host.
  - The output is static (pan/zoom only) and bounded by `maxEdges` 500. Good for the macro view and for small blast radii. mermaid v12.1.0 was published 2026-10-02.
- **Cytoscape.js**:
  - MIT ("core Cytoscape.js library and all first-party extensions"), v3.34.3 (2026-09-07) ([site](https://js.cytoscape.org/)).
  - **Compound nodes** (`parent`) map directly to package → module/feature → file, which allows expand/collapse between macro and micro on one page.
  - Dagre/ELK layouts are available as extensions.
  - It runs headless in Node, which allows pre-computing positions in CI. Best fit for an interactive macro↔micro site.
- **Graphviz in the browser (`@viz-js/viz`)**:
  - A WebAssembly build of Graphviz, MIT, v3.31.0 (2026-09-28) ([repo](https://github.com/mdaines/viz-js)).
  - It renders depcruise `dot` output client-side with no Graphviz on the runner. The output is SVG with best-in-class layered layout, but there is no built-in expand/collapse.
- **d3**: maximum freedom, but you would hand-build what Cytoscape already provides (compound nodes, layouts, selection). Not worth it at this scale.

## Where the output lives

| Destination | Fit | Facts |
| --- | --- | --- |
| Committed Mermaid `.md` | **Macro only.** It is also the view to use during spec work, because it is in the repo and diffable in the PR that changes the architecture. | Rendered natively. It needs a CI drift check (regenerate and diff) so it can't go stale. File level hits the 500-edge cap. |
| PR comment / job summary | **Per-PR blast radius** (Mermaid, collapsed or highlighted) plus a text list of the layers crossed. | Job summaries support GFM; there is a "maximum size of 1MiB" per step and "a maximum of 20 job summaries" per job ([workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)). The issue-comment body cap of **65536 chars** is enforced by the API (422) but is not officially documented ([community catalog](https://github.com/dead-claudia/github-limits)), so truncate and link out. Use a sticky, updated comment rather than a new one on every push. |
| CI artifact (HTML/SVG) | Full per-PR interactive detail, for example a self-contained `dot-webpage` or a Cytoscape page. | Retained "90 days by default". With `archive: false`, "only a single file can be uploaded", so it has to be one self-contained HTML file. The `artifact-url` needs the user to be logged in ([upload-artifact](https://github.com/actions/upload-artifact)). Viewing it means a download; it is not browsable at a link. |
| GitHub Pages | **The `main` interactive site** (macro↔micro). Not per-PR previews. | "Maximum of one pages site per repository" ([what is Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). Limits are 1 GB, a 10 min deploy timeout and a 100 GB/month soft bandwidth cap ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). An Actions deploy needs `pages: write` + `id-token: write` and the `github-pages` environment ([custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)). `actions/deploy-pages` deploys the uploaded artifact as the site, and its `preview` (PR preview) input "is only in alpha currently and is not available to the public" ([deploy-pages](https://github.com/actions/deploy-pages)). The environment is protected by default, which restricts deploys from PR branches. **Per-PR subpaths would need the legacy `gh-pages`-branch flow** (each PR commits into `/pr-N/`), which brings write-token-on-PR and cleanup concerns. Prefer artifacts for PRs. The repo is public, so the site is public too, which is fine for an architecture graph. |

## Recommended shortlist for prototype #207

1. **Mermaid-only, zero hosting (the cheapest)**
   - dependency-cruiser generates `docs/architecture.md`: an `archi`/collapse macro graph of packages and Nest modules/web features, committed, with a CI drift check.
   - On each PR, `depcruise --affected origin/main` (or `--highlight "$(watskeburt origin/main)"`) collapsed to module level gives a Mermaid blast radius plus a "layers crossed: api / shared / web" line, posted as a sticky PR comment and the job summary.
   - The micro view is on demand with `--focus`.
   - Weak spot: no interactive micro view.
2. **Option 1 + interactive site (the most complete; my default pick)**
   - Same PR comment.
   - Add a single-file Cytoscape.js page (compound nodes package → module/feature → file, fed by `depcruise -T json`) as a **PR artifact**, with the changed and affected nodes highlighted.
   - The same page is deployed from `main` to **GitHub Pages** as the always-current macro↔micro explorer. That page is also the place to judge a proposed destination during spec work.
   - Cost: one small custom HTML/JS renderer to maintain.
3. **Option 2 + a Nest DI overlay**
   - Add the true Nest module-import graph via `nestjs-spelunker` or `SerializedGraph`, booting `createApplicationContext` in CI.
   - Worth it only if the import-level module view proves misleading. It depends on #194's lazy DB connection, and spelunker is early-stage and slow-moving.
   - Prototype it last, or skip it.

Rejected: madge (stale, and a subset of depcruise), Nest Devtools CI (Enterprise plan), d3 from scratch (Cytoscape already gives compound nodes and layouts), per-PR Pages previews (alpha, not public).

## Open questions for #207

- How to resolve `shared` to source (build first, or alias in the depcruise config). This must be settled, or the cross-layer edges vanish.
- Whether depcruise `forbidden` rules or ESLint owns layer-boundary enforcement (the map's one-blocking-owner rule). The viz itself should stay informative.
- Whether test files belong in the graph. Probably excluded from macro and shown in the blast radius ("which tests are affected").
- `dot-webpage` needs Graphviz on the runner (`apt-get install graphviz`), whereas Cytoscape or `@viz-js/viz` render in the browser with no system dependency.
