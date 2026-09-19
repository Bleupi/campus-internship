import { Box, Paper, Stack, Typography } from "@mui/material";
import type { StageListItemResponse } from "shared";
import { StageDetailLink } from "./StageDetailLink";
import { StageListItemBody } from "./StageListItemBody";
import { organismLabel } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";

// Desktop layout: one row per request with its action inline, never expanded.
export function StageRow({ stage }: { stage: StageListItemResponse }) {
  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, listStyle: "none" }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {organismLabel(stage)}
          </Typography>
          <StageStatusChip status={stage.status} />
        </Stack>
        <StageListItemBody stage={stage} />
      </Box>
      <StageDetailLink stageId={stage.id} />
    </Paper>
  );
}
