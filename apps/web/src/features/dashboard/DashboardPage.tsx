import { Box, Typography } from "@mui/material";

// Placeholder body until the real dashboard screen (issue #11) exists. With
// stage management on, a student never lands here: their default page is the
// request list (App.tsx HomeRoute).
export function DashboardPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, mt: 8 }}>
      <Typography>Tableau de bord (à venir)</Typography>
    </Box>
  );
}
