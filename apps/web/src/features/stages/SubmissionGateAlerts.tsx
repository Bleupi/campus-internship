import { Alert, Stack } from "@mui/material";

interface Props {
  blockers: string[];
  profileFailed: boolean;
}

// Why "Soumettre" is disabled, next to the button itself: a visible, specific
// reason rather than a generic error (issue #115).
export function SubmissionGateAlerts({ blockers, profileFailed }: Props) {
  return (
    <>
      {blockers.length > 0 && (
        <Alert severity="warning">
          <Stack component="ul" sx={{ m: 0, pl: 2 }}>
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </Stack>
        </Alert>
      )}
      {profileFailed && (
        <Alert severity="error">Impossible de vérifier l'état de votre profil de stage.</Alert>
      )}
    </>
  );
}
