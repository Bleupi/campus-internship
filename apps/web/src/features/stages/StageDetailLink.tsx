import { Button } from "@mui/material";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import { Link, useLocation } from "react-router-dom";
import { stageDetailPath } from "../../routes";

// Carries the list's current filter/sort in router state so the detail page's
// "Mes demandes" link can return to the same view (the browser back button
// already does, since the list keeps them in the URL).
export function StageDetailLink({ stageId }: { stageId: string }) {
  const location = useLocation();

  return (
    <Button
      component={Link}
      to={stageDetailPath(stageId)}
      state={{ from: location.search }}
      size="small"
      endIcon={<ArrowForwardOutlinedIcon />}
    >
      Voir le détail
    </Button>
  );
}
