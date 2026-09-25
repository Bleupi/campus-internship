import { IconButton, Tooltip } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import type { AdminStageRequestListItem } from "shared";
import { ApiError } from "../../lib/api-client";
import { useValidateStageRequest } from "./useValidateStageRequest";

const NO_REFERENT_HINT = "Assignez d'abord un référent pour pouvoir valider cette demande";

interface ValidateStageButtonProps {
  request: AdminStageRequestListItem;
  hasReferent: boolean;
  onConflict: () => void;
  onErrorChange: (hasError: boolean) => void;
}

// Issue #152: single click, no confirmation step. Its own mutation instance
// (unlike RefuseStageDialog, which is shared across the table because it's a
// single dialog mounted once) — one per row, so only the clicked row's button
// disables while its call is in flight.
export function ValidateStageButton({
  request,
  hasReferent,
  onConflict,
  onErrorChange,
}: ValidateStageButtonProps) {
  const validateStageRequest = useValidateStageRequest();

  async function handleValidate() {
    onErrorChange(false);
    try {
      await validateStageRequest.mutateAsync({ id: request.id, version: request.version });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onConflict();
      } else {
        onErrorChange(true);
      }
    }
  }

  return (
    <Tooltip title={hasReferent ? "Valider" : NO_REFERENT_HINT}>
      <span>
        <IconButton
          size="small"
          color="success"
          aria-label="Valider"
          disabled={!hasReferent || validateStageRequest.isPending}
          onClick={handleValidate}
        >
          <CheckCircleOutlinedIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
