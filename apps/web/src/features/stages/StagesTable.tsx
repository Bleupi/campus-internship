import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { StageListItemResponse } from "shared";
import { StageDetailLink } from "./StageDetailLink";
import { SEMESTER_LABELS, formatFirstPeriod, organismLabel } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";

// Desktop layout (chosen prototype, variant A's table): the location first,
// then status, first period, semester and kind, with the row's actions in the
// last column. Never expanded: the eye button opens the full page.
export function StagesTable({ stages }: { stages: StageListItemResponse[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Organisme</TableCell>
            <TableCell>Statut</TableCell>
            <TableCell>Période</TableCell>
            <TableCell>Semestre</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stages.map((stage) => (
            <TableRow key={stage.id} hover>
              <TableCell sx={{ fontWeight: 700 }}>{organismLabel(stage)}</TableCell>
              <TableCell>
                <StageStatusChip status={stage.status} />
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{formatFirstPeriod(stage)}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {SEMESTER_LABELS[stage.semester]}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {stage.schoolYear}
                </Typography>
              </TableCell>
              <TableCell>{stage.mandatory ? "Obligatoire" : "Facultatif"}</TableCell>
              <TableCell align="right">
                <StageDetailLink stageId={stage.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
