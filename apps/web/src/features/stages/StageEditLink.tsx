import { Button, IconButton, Tooltip } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Link } from "react-router-dom";
import { stageEditPath } from "../../routes";

// Only ever rendered for a DRAFT: it is the only status a student can edit.
//
// `labelled` follows StageDetailLink: the mobile accordion gets a text button,
// the desktop table's compact actions column keeps the bare pen icon.
export function StageEditLink({
  stageId,
  labelled = false,
}: {
  stageId: string;
  labelled?: boolean;
}) {
  if (labelled) {
    return (
      <Button component={Link} to={stageEditPath(stageId)} size="small">
        Modifier
      </Button>
    );
  }

  const label = "Modifier la demande";
  return (
    <Tooltip title={label}>
      <IconButton
        component={Link}
        to={stageEditPath(stageId)}
        size="small"
        color="primary"
        aria-label={label}
      >
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
