---
"web": minor
---

Add a reusable authenticated app shell (issue #16).

`apps/web/src/components/AppShell.tsx` — an MUI `AppBar`/`Toolbar` with nav links ("Tableau de bord", "Profil") and a logout action, rendered around every protected route via a nested layout route. `RequireAuth` in `App.tsx` no longer takes `children`; it renders `<Outlet/>` once `useCurrentUser()` resolves, so the shell only mounts for an authenticated user (no nav-bar flash during the loading/redirect states). The placeholder `DashboardPage` no longer owns its own "Mon profil" link or logout button — those now live in the shell. Active nav link is indicated via `NavLink`'s `aria-current` plus a visual underline, matched on exact pathname (no role-based filtering yet — see issue #16's grilling notes).

New dependency: `@mui/icons-material` (nav/logout icons), pinned to the same `^9.3.1` range as the already-present `@mui/material`.

Below the `sm` breakpoint (600px), the inline nav row and logout button are replaced by a menu button opening a `Drawer` with the same nav links and a logout item; it closes on nav-item click, backdrop tap, or Escape. Desktop rendering is unchanged.
