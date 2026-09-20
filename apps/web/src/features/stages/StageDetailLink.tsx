import { IconButton, Tooltip } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Link, useLocation } from "react-router-dom";
import { stageDetailPath } from "../../routes";

// Carries the list's current filter/sort in router state so the detail page's
// "Mes demandes" link can return to the same view (the browser back button
// already does, since the list keeps them in the URL).
export function StageDetailLink({ stageId }: { stageId: string }) {
  const location = useLocation();

  return (
    <Tooltip title="Voir le détail">
      <IconButton
        component={Link}
        to={stageDetailPath(stageId)}
        state={{ from: location.search }}
        size="small"
        color="primary"
        aria-label="Voir le détail"
      >
        <VisibilityOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
