import { Button, IconButton, Tooltip } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Link, useLocation } from "react-router-dom";
import { stageDetailPath } from "../../routes";

const LABEL = "Voir le détail";

// Carries the list's current filter/sort in router state so the detail page's
// "Mes demandes" link can return to the same view (the browser back button
// already does, since the list keeps them in the URL).
//
// `labelled` is for the mobile accordion, where an eye icon on its own isn't
// self-explanatory; the desktop table's compact actions column keeps the icon.
export function StageDetailLink({
  stageId,
  labelled = false,
}: {
  stageId: string;
  labelled?: boolean;
}) {
  const location = useLocation();
  const link = {
    component: Link,
    to: stageDetailPath(stageId),
    state: { from: location.search },
  } as const;

  if (labelled) {
    return (
      <Button {...link} size="small">
        {LABEL}
      </Button>
    );
  }

  return (
    <Tooltip title={LABEL}>
      <IconButton {...link} size="small" color="primary" aria-label={LABEL}>
        <VisibilityOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
