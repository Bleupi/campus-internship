import { Box, Paper, Typography } from "@mui/material";
import type { StageListItemResponse } from "shared";
import { StageDetailLink } from "./StageDetailLink";
import { StageMeta } from "./StageListItemBody";
import { formatFirstPeriod, organismLabel } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";

// Desktop layout (chosen prototype, variant C's dense line): status, organism,
// first period, with the row's actions on the side. Never expanded: the
// student opens the full page from the action button.
export function StageRow({ stage }: { stage: StageListItemResponse }) {
  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, listStyle: "none" }}
    >
      <StageStatusChip status={stage.status} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>{organismLabel(stage)}</Typography>
        <StageMeta stage={stage} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {formatFirstPeriod(stage)}
      </Typography>
      <StageDetailLink stageId={stage.id} />
    </Paper>
  );
}
