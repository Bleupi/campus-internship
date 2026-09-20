import { Stack, Typography } from "@mui/material";
import type { StageListItemResponse } from "shared";
import { formatDate, formatPeriodRange } from "./format-summary";
import { SEMESTER_LABELS, formatStageKind } from "./stage-labels";

// One-line description of a request (semester, school year, kind, submission).
export function StageMeta({ stage }: { stage: StageListItemResponse }) {
  const parts = [
    SEMESTER_LABELS[stage.semester],
    stage.schoolYear,
    formatStageKind(stage.mandatory),
    stage.submittedAt ? `Soumise le ${formatDate(stage.submittedAt)}` : null,
  ];
  return (
    <Typography variant="body2" color="text.secondary">
      {parts.filter(Boolean).join(" · ")}
    </Typography>
  );
}

// What a mobile row reveals when expanded: everything the collapsed line
// leaves out, so the student rarely needs the full detail page for a glance.
export function StageListItemBody({ stage }: { stage: StageListItemResponse }) {
  return (
    <Stack spacing={0.25}>
      <StageMeta stage={stage} />
      {stage.periods.map((period) => (
        <Typography key={period.id} variant="body2">
          {formatPeriodRange(period)}
        </Typography>
      ))}
    </Stack>
  );
}
