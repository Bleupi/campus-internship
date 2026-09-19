import { Box, Button, Typography } from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Link } from "react-router-dom";
import { isStageManagementEnabled } from "../../lib/feature-flags";
import { ROUTES } from "../../routes";
import { useCurrentUser } from "../auth/useCurrentUser";

// Placeholder body until the real dashboard screen (issue #11) exists; the
// "Nouvelle demande" entry point lives here rather than in the nav menu.
export function DashboardPage() {
  const { data: me } = useCurrentUser();
  const isStudent = me?.user.roles.includes("STUDENT") ?? false;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, mt: 8 }}>
      <Typography>Tableau de bord (à venir)</Typography>
      {/* Issue #113: student-only, and only while the feature flag is on. */}
      {isStageManagementEnabled && isStudent && (
        <Button
          component={Link}
          to={ROUTES.STAGE_NEW}
          variant="contained"
          startIcon={<AddOutlinedIcon />}
        >
          Nouvelle demande
        </Button>
      )}
    </Box>
  );
}
