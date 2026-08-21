# ADR-0017 — Design system: MUI, bordeaux/gold theme

- Status: Accepted
- Date: 2026-08-21
- Deciders: project owner

## Context

`apps/web` needed one locked choice covering both a component library (Tailwind alone / shadcn+Radix / MUI / hand-rolled) and a visual style, before any UI implementation ticket could be filed (see [wayfinder ticket #5](https://github.com/Bleupi/campus-internship/issues/5) on the [userFlow → specs → issues map](https://github.com/Bleupi/campus-internship/issues/4), and `docs/agents/spec-pipeline.md`). Hand-rolled was ruled out up front: the target users are 15-20 year-olds and accessibility is a hard requirement, and hand-rolled interactive components (dialogs, comboboxes) mean owning focus-trap/ARIA/keyboard behavior from scratch — real risk of subtle a11y bugs with no headless primitive underneath. Tailwind-alone carries the same risk for the same reason and was dropped for the same cause.

That left two candidates, both built on tested accessible primitives:

- **MUI** — components largely implement WAI-ARIA authoring patterns internally (focus trapping, keyboard nav, `aria-*` wiring) as a consumed dependency; carries a strong default Material Design identity that takes real theming effort to move away from.
- **shadcn/ui + Radix** — Radix primitives have the same caliber of accessibility guarantees, but shadcn's CLI copies component source into the repo rather than installing it as an opaque package: full control over visual style, at the cost of owning and maintaining that copied code yourself (Tailwind classes, no `npm update` fixing it later).

Both were prototyped concretely: login, stage-submission, and dashboard screens, in both stacks, switchable live via a floating bar (`?variant=`/`?screen=`) — see the [`prototype/design-system-comparison`](https://github.com/Bleupi/campus-internship/tree/prototype/design-system-comparison) branch (commit `a173cbb`), the primary source for the full set of variants (not merged to `main`).

Once both were running, a style pass converged on:

- **Palette**: two saturated accent colors (energetic, closer to apps this age group already uses — Duolingo, Revolut, N26 — rather than a subdued institutional palette), reserved for interactive elements only (buttons, links, active states, badges) — never for body text, to keep contrast unaffected. Anchored to Université Paris Cité's own brand color, `#8A1538` (confirmed from `u-paris.fr`'s stylesheet — used across links, buttons, and nav highlights), paired with a dynamic gold, `#F5A623`.
- **Density**: airy/spacious — generous whitespace, larger touch targets.
- **Typography**: a single system font stack (no separate display font, no webfont to load).
- **Tone**: French UI copy slightly warmer than strictly institutional, while staying professional.

The deciding factor between the two stacks ended up being **project timeline**, surfaced after the visual style was already settled: the student profile/admin-approval flow is due the first week of September 2026, stage management the second week, with limited non-daily working time in between. MUI needs no component code written or maintained (`Select`, `Dialog`, `DataGrid`-class components ship as dependencies); shadcn/ui+Radix would mean maintaining hand-adapted primitives (`button.tsx`, `select.tsx`, `card.tsx`, …) as first-party code for the rest of the project. Given the deadline, that maintenance cost outweighs shadcn's fuller styling control.

## Decision

**MUI** is the component library for `apps/web`, themed via a single `createTheme()` call (`apps/web/src/theme.ts`):

- `palette.primary.main`: `#8A1538` (bordeaux)
- `palette.secondary.main`: `#F5A623` (gold)
- `shape.borderRadius`: `10`
- `typography.fontFamily`: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

Airy spacing and slightly warmer French copy are conventions for screens built on top of this theme, not encoded in the theme object itself — the first UI implementation ticket wraps `apps/web/src/main.tsx` in `ThemeProvider` (+ `CssBaseline`) using this theme; it is not wired in yet, since no screen exists to consume it.

## Consequences

- `@mui/material`, `@emotion/react`, `@emotion/styled` are dependencies of `apps/web`. No Tailwind, PostCSS, `class-variance-authority`, or `@radix-ui/*` packages — those were installed only for the prototype and were not carried over.
- Every future screen composes MUI components rather than hand-rolled or shadcn-copied ones; status/semantic colors (e.g. stage-status badges) use MUI's own semantic palette (`success`/`warning`/`error`), independent of the two brand accent colors, which stay reserved for primary interactive elements.
- Overriding MUI's Material Design default look (beyond the palette/shape/typography already set) costs real theming effort if a more distinctive visual identity is wanted later — accepted, given the timeline.
- Alternatives considered: shadcn/ui + Radix (rejected — real accessibility parity, but the ongoing cost of maintaining first-party component code doesn't fit the September deadline); Tailwind alone and hand-rolled components (rejected up front — no headless-primitive accessibility guarantee for interactive components, unacceptable risk for a 15-20 year-old audience with an explicit accessibility requirement).
