import { createTheme } from "@mui/material/styles";

// Design-system decision locked by ADR-0017: MUI, themed with a bordeaux
// (#8A1538 — Université Paris Cité's own brand color, confirmed from
// u-paris.fr's stylesheet) + gold (#F5A623) accent, a single system font,
// and generous spacing. Not yet wired into the app shell — the first UI
// implementation ticket wraps `main.tsx` in a `ThemeProvider` using this.
export const theme = createTheme({
  palette: {
    primary: { main: "#8A1538" },
    secondary: { main: "#F5A623" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
});
