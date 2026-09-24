import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError } from "../../lib/api-client";
import {
  buildRefusalReason,
  isRefusalReasonComplete,
  MISSING_INFO_HINT,
  REFUSAL_REASONS,
} from "./refusal-reason";
import { useRefuseStageRequest } from "./useRefuseStageRequest";

export interface RefusingRequest {
  id: string;
  version: number;
}

interface RefuseStageDialogProps {
  request: RefusingRequest | null;
  onClose: () => void;
  onConflict: () => void;
}

// Issue #151: refuse one PENDING request at a time (never bulk, CLAUDE.md
// §12/#144's grilling). One dialog shared by every row of StageRequestsPage
// rather than one per row, so it's only ever mounted once.
export function RefuseStageDialog({ request, onClose, onConflict }: RefuseStageDialogProps) {
  const [checkedReasons, setCheckedReasons] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [genericError, setGenericError] = useState(false);
  const refuseMutation = useRefuseStageRequest();

  function toggleReason(reason: string) {
    setCheckedReasons((previous) =>
      previous.includes(reason)
        ? previous.filter((checked) => checked !== reason)
        : [...previous, reason],
    );
  }

  function handleClose() {
    setCheckedReasons([]);
    setFreeText("");
    setGenericError(false);
    refuseMutation.reset();
    onClose();
  }

  async function handleRefuse() {
    if (!request) return;
    setGenericError(false);
    const reason = buildRefusalReason(checkedReasons, freeText);
    try {
      await refuseMutation.mutateAsync({ id: request.id, version: request.version, reason });
      handleClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onConflict();
        handleClose();
        return;
      }
      // Any other error: leave the dialog open (so the reason isn't lost)
      // but say so — a silent no-op here would look like a successful click.
      setGenericError(true);
    }
  }

  const valid = isRefusalReasonComplete(checkedReasons, freeText);

  return (
    <Dialog open={request !== null} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Refuser la demande</DialogTitle>
      <DialogContent>
        {genericError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Une erreur est survenue, réessayez.
          </Alert>
        )}
        <FormGroup>
          {REFUSAL_REASONS.map((reason) => (
            <FormControlLabel
              key={reason}
              control={
                <Checkbox
                  checked={checkedReasons.includes(reason)}
                  onChange={() => toggleReason(reason)}
                />
              }
              label={reason}
            />
          ))}
        </FormGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {MISSING_INFO_HINT}
        </Typography>
        <TextField
          label="Précision (facultatif)"
          fullWidth
          multiline
          minRows={2}
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Annuler</Button>
        <Button
          variant="contained"
          color="error"
          disabled={!valid || refuseMutation.isPending}
          onClick={handleRefuse}
        >
          Refuser
        </Button>
      </DialogActions>
    </Dialog>
  );
}
