import { Chip } from "@mui/material";
import type { StageStatus } from "shared";
import { STAGE_STATUS_LABELS } from "./stage-labels";

const STATUS_COLORS = {
  DRAFT: "default",
  PENDING: "warning",
  VALIDATED: "success",
  REFUSED: "error",
} as const satisfies Record<StageStatus, "default" | "warning" | "success" | "error">;

export function StageStatusChip({ status }: { status: StageStatus }) {
  return <Chip size="small" color={STATUS_COLORS[status]} label={STAGE_STATUS_LABELS[status]} />;
}
