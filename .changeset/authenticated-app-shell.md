---
"web": minor
---

Add a reusable authenticated app shell (issue #16).

`apps/web/src/components/AppShell.tsx` — an MUI `AppBar`/`Toolbar` with nav links ("Tableau de bord", "Profil") and a logout action, rendered around every protected route via a nested layout route. `RequireAuth` in `App.tsx` no longer takes `children`; it renders `<Outlet/>` once `useCurrentUser()` resolves, so the shell only mounts for an authenticated user (no nav-bar flash during the loading/redirect states). The placeholder `DashboardPage` no longer owns its own "Mon profil" link or logout button — those now live in the shell. Active nav link is indicated via `NavLink`'s `aria-current` plus a visual underline, matched on exact pathname (no role-based filtering yet — see issue #16's grilling notes).

New dependency: `@mui/icons-material` (nav/logout icons), pinned to the same `^9.3.1` range as the already-present `@mui/material`.
