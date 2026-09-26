import { Alert, Button, Stack } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { useId } from "react";
import { Link } from "react-router-dom";
import type { StageDetailResponse } from "shared";
import { stageEditPath } from "../../../routes";
import { describeSubmitError } from "../submit/submit-error-message";
import { SubmissionGateAlerts } from "../submit/SubmissionGateAlerts";
import { useSubmissionGate } from "../submit/useSubmissionGate";
import { useSubmitStage } from "../submit/useSubmitStage";

// Only rendered for a DRAFT. The reasons "Soumettre" is blocked (missing
// fields, profile) and the way to fix them ("Modifier") live together, above
// and next to the buttons: inline from `sm` up, stacked on a phone.
export function DraftActionsSection({ stage }: { stage: StageDetailResponse }) {
  const submit = useSubmitStage();
  const reasonsId = useId();
  const gate = useSubmissionGate({
    // StageDetailResponse always carries both: the API assembles a draft
    // only from a stage with an organism and a tutor.
    hasOrganism: true,
    hasTutor: true,
    service: stage.service,
    projectType: stage.projectType,
    motivation: stage.motivation,
    periods: stage.periods,
  });

  const hasReasons = gate.blockers.length > 0 || gate.profileFailed;

  return (
    <Stack spacing={1.5}>
      <SubmissionGateAlerts
        id={reasonsId}
        blockers={gate.blockers}
        profileFailed={gate.profileFailed}
      />
      {submit.error && <Alert severity="error">{describeSubmitError(submit.error)}</Alert>}
      <Stack
        role="group"
        aria-label="Actions de la demande"
        sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}
      >
        <Button
          component={Link}
          to={stageEditPath(stage.id)}
          variant="outlined"
          startIcon={<EditOutlinedIcon />}
          aria-label="Modifier la demande de stage"
        >
          Modifier
        </Button>
        <Button
          variant="contained"
          startIcon={<SendOutlinedIcon />}
          disabled={!gate.canSubmit || submit.isPending}
          onClick={() => submit.mutate(stage.id)}
          aria-label="Soumettre la demande de stage"
          aria-describedby={hasReasons ? reasonsId : undefined}
        >
          Soumettre
        </Button>
      </Stack>
    </Stack>
  );
}
