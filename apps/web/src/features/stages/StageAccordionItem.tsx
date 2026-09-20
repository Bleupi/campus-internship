import {
  Accordion,
  AccordionActions,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import type { StageListItemResponse } from "shared";
import { StageDetailLink } from "./StageDetailLink";
import { StageListItemBody } from "./StageListItemBody";
import { formatFirstPeriod, organismLabel } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";

// Mobile layout (chosen prototype, variant C): a dense accordion line with the
// status, organism and first period, collapsed by default (uncontrolled, so no
// row is ever forced open). The full request is a separate, explicit action.
export function StageAccordionItem({ stage }: { stage: StageListItemResponse }) {
  return (
    <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
        <Box
          sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, width: "100%" }}
        >
          <Typography sx={{ flexGrow: 1, fontWeight: 700 }}>{organismLabel(stage)}</Typography>
          <StageStatusChip status={stage.status} />
          <Typography variant="caption" color="text.secondary">
            {formatFirstPeriod(stage)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <StageListItemBody stage={stage} />
      </AccordionDetails>
      <AccordionActions>
        <StageDetailLink stageId={stage.id} />
      </AccordionActions>
    </Accordion>
  );
}
