import {
  Accordion,
  AccordionActions,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import type { StageListItemResponse } from "shared";
import { StageDetailLink } from "./StageDetailLink";
import { StageListItemBody } from "./StageListItemBody";
import { organismLabel } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";

// Mobile layout: a dense accordion, collapsed by default (uncontrolled, so no
// row is ever forced open). Opening the full request is a separate action.
export function StageAccordionItem({ stage }: { stage: StageListItemResponse }) {
  return (
    <Accordion
      disableGutters
      variant="outlined"
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
        <Typography sx={{ flexGrow: 1, fontWeight: 700, alignSelf: "center" }}>
          {organismLabel(stage)}
        </Typography>
        <StageStatusChip status={stage.status} />
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
