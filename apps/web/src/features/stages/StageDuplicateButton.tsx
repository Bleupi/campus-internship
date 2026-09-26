import { Button, IconButton, Tooltip } from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

const LABEL = "Dupliquer la demande";

// Offered on every status, unlike StageEditLink. `labelled` is for the mobile
// accordion, like StageDetailLink; the desktop table's compact actions column
// keeps the bare icon.
export function StageDuplicateButton({
  onDuplicate,
  disabled,
  labelled = false,
}: {
  onDuplicate: () => void;
  disabled: boolean;
  labelled?: boolean;
}) {
  if (labelled) {
    return (
      <Button size="small" disabled={disabled} onClick={onDuplicate}>
        Dupliquer
      </Button>
    );
  }

  return (
    <Tooltip title={LABEL}>
      {/* The span keeps the tooltip working while the button is disabled. */}
      <span>
        <IconButton
          size="small"
          color="primary"
          aria-label={LABEL}
          disabled={disabled}
          onClick={onDuplicate}
        >
          <ContentCopyOutlinedIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
