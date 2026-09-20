import { Alert, Button, Stack } from "@mui/material";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import type { StageDetailResponse } from "shared";
import { describeSubmitError } from "./submit-error-message";
import { SubmissionGateAlerts } from "./SubmissionGateAlerts";
import { useSubmissionGate } from "./useSubmissionGate";
import { useSubmitStage } from "./useSubmitStage";

// Only rendered for a DRAFT.
export function SubmitStageSection({ stage }: { stage: StageDetailResponse }) {
  const submit = useSubmitStage();
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

  return (
    <Stack spacing={1.5}>
      <SubmissionGateAlerts blockers={gate.blockers} profileFailed={gate.profileFailed} />
      {submit.error && <Alert severity="error">{describeSubmitError(submit.error)}</Alert>}
      <Button
        variant="contained"
        startIcon={<SendOutlinedIcon />}
        disabled={!gate.canSubmit || submit.isPending}
        onClick={() => submit.mutate(stage.id)}
        sx={{ alignSelf: "flex-start" }}
      >
        Soumettre
      </Button>
    </Stack>
  );
}
