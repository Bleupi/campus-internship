import { Chip } from "@mui/material";
import type { StageStatus } from "shared";
import { STAGE_STATUS_LABELS } from "./stage-labels";

const STATUS_COLORS = {
  DRAFT: "default",
  PENDING: "info",
  VALIDATED: "success",
  REFUSED: "error",
} as const satisfies Record<StageStatus, "default" | "info" | "success" | "error">;

export function StageStatusChip({ status }: { status: StageStatus }) {
  return (
    <Chip
      size="small"
      color={STATUS_COLORS[status]}
      label={STAGE_STATUS_LABELS[status]}
      sx={{ minWidth: 90 }}
    />
  );
}
