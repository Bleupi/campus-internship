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
import { StageDuplicateButton } from "../duplicate/StageDuplicateButton";
import { StageEditLink } from "./StageEditLink";
import { mandatoryLabel } from "../format-summary";
import { SEMESTER_LABELS, formatFirstPeriod, organismLabel } from "../stage-labels";
import { StageStatusChip } from "../StageStatusChip";

// Desktop layout (chosen prototype, variant A's table): the location first,
// then status, first period, semester and kind, with the row's actions in the
// last column. Never expanded: the eye button opens the full page, a DRAFT also
// gets a pen, and every status can be duplicated in place.
export function StagesTable({
  stages,
  onDuplicate,
  duplicating,
}: {
  stages: StageListItemResponse[];
  onDuplicate: (stageId: string) => void;
  duplicating: boolean;
}) {
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
              <TableCell>{mandatoryLabel(stage.mandatory)}</TableCell>
              <TableCell align="right">
                {stage.status === "DRAFT" && <StageEditLink stageId={stage.id} />}
                <StageDuplicateButton
                  disabled={duplicating}
                  onDuplicate={() => onDuplicate(stage.id)}
                />
                <StageDetailLink stageId={stage.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
