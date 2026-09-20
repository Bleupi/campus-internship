import type { ReactNode } from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

// Shared by the wizard's recap step and the stage detail page (issue #114), so
// a request reads the same before and after it is saved.
// Three visual levels so nothing the student typed can be mistaken for chrome:
// section title (bold, brand colour) > field label (small, muted) > value
// (regular body text, full contrast).
export function RecapSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" component="section">
      <CardContent>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ color: "primary.main", fontWeight: 700, mb: 1.5 }}
        >
          {title}
        </Typography>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function RecapField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography
        component="dt"
        variant="caption"
        sx={{ display: "block", color: "text.secondary", fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="body1"
        sx={{ m: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
      >
        {children}
      </Typography>
    </Box>
  );
}

export function SecondaryLine({ children }: { children: ReactNode }) {
  return (
    <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
      {children}
    </Typography>
  );
}
