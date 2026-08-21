import { createTheme } from "@mui/material/styles";

// PROTOTYPE palette (issue #5): bordeaux inspired by Université Paris Cité's
// own brand color (#8A1538, confirmed from u-paris.fr's stylesheet) + a
// dynamic gold accent. Reserved for interactive elements (buttons, links,
// active states) — body text stays near-black/gray for contrast.
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
