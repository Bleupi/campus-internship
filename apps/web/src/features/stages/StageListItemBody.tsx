import { Stack, Typography } from "@mui/material";
import type { StageListItemResponse } from "shared";
import { formatDate, formatPeriodRange } from "./format-summary";
import { SEMESTER_LABELS, formatStageKind } from "./stage-labels";

// The descriptive lines of one request, shared by the desktop row and the
// mobile accordion's expanded body so both layouts show the same facts.
export function StageListItemBody({ stage }: { stage: StageListItemResponse }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2" color="text.secondary">
        {`${SEMESTER_LABELS[stage.semester]} · ${stage.schoolYear} · ${formatStageKind(stage.mandatory)}`}
      </Typography>
      {stage.periods.map((period) => (
        <Typography key={period.id} variant="body2">
          {formatPeriodRange(period)}
        </Typography>
      ))}
      {stage.submittedAt && (
        <Typography variant="caption" color="text.secondary">
          {`Soumise le ${formatDate(stage.submittedAt)}`}
        </Typography>
      )}
    </Stack>
  );
}
