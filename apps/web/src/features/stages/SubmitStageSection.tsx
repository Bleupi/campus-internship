import { Alert, Button, Stack } from "@mui/material";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { getSubmissionBlockers, type StageDetailResponse } from "shared";
import { ApiError } from "../../lib/api-client";
import { useProfile } from "../students/useProfile";
import { useSubmitStage } from "./useSubmitStage";

// ApiError.message is the raw response body, so it is never shown as is.
function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Cette demande a déjà été soumise ou modifiée. La page a été actualisée.";
  }
  if (error instanceof ApiError && error.status === 400) {
    return "La demande est incomplète ou votre profil n'est pas validé. La page a été actualisée.";
  }
  return "La demande n'a pas pu être soumise. Réessayez.";
}

// Only rendered for a DRAFT. The button's gate is the same
// getSubmissionBlockers() the API enforces, so the reason shown here is the
// exact reason the server would reject with.
export function SubmitStageSection({ stage }: { stage: StageDetailResponse }) {
  const profile = useProfile();
  const submit = useSubmitStage(stage.id);

  // Until the profile is known the gate can't be evaluated: keep the button
  // disabled without inventing a reason.
  const blockers = profile.data
    ? getSubmissionBlockers({
        profileStatus: profile.data.profileStatus,
        // StageDetailResponse always carries both: the API assembles a draft
        // only from a stage with an organism and a tutor.
        hasOrganism: true,
        hasTutor: true,
        service: stage.service,
        projectType: stage.projectType,
        motivation: stage.motivation,
        periods: stage.periods,
      })
    : [];
  const canSubmit = profile.data !== undefined && blockers.length === 0;

  return (
    <Stack spacing={1.5}>
      {blockers.length > 0 && (
        <Alert severity="warning">
          <Stack component="ul" sx={{ m: 0, pl: 2 }}>
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </Stack>
        </Alert>
      )}
      {profile.error && (
        <Alert severity="error">Impossible de vérifier l'état de votre profil de stage.</Alert>
      )}
      {submit.error && <Alert severity="error">{submitErrorMessage(submit.error)}</Alert>}
      <Button
        variant="contained"
        startIcon={<SendOutlinedIcon />}
        disabled={!canSubmit || submit.isPending}
        onClick={() => submit.mutate()}
        sx={{ alignSelf: "flex-start" }}
      >
        Soumettre
      </Button>
    </Stack>
  );
}
