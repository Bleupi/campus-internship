import { IconButton, Tooltip } from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

// The desktop table's compact actions column keeps a bare icon, like
// StageDetailLink and StageEditLink. Unlike them it is offered on every status.
export function StageDuplicateButton({
  onDuplicate,
  disabled,
}: {
  onDuplicate: () => void;
  disabled: boolean;
}) {
  const label = "Dupliquer la demande";
  return (
    <Tooltip title={label}>
      {/* The span keeps the tooltip working while the button is disabled. */}
      <span>
        <IconButton
          size="small"
          color="primary"
          aria-label={label}
          disabled={disabled}
          onClick={onDuplicate}
        >
          <ContentCopyOutlinedIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
