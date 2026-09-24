import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import type { AdminStageRequestListItem } from "shared";

// Issue #149: "s'applique aussi à N autre(s) demande(s) en cours de l'étudiant X".
function impactMessage(request: AdminStageRequestListItem): string {
  const count = request.otherLiveStageCount;
  const plural = count > 1 ? "s" : "";
  const { firstName, lastName } = request.student;
  return `Ce changement s'applique aussi à ${count} autre${plural} demande${plural} en cours de l'étudiant ${firstName} ${lastName}.`;
}

interface ReferentChangeImpactDialogProps {
  request: AdminStageRequestListItem | null;
  onCancel: () => void;
  onConfirm: () => void;
}

// Issue #149: confirms a referent change that also reassigns the student's
// other live requests sharing the tuple (ADR-0014). One dialog shared by
// every row of StageRequestsPage, open while `request` is set.
export function ReferentChangeImpactDialog({
  request,
  onCancel,
  onConfirm,
}: ReferentChangeImpactDialogProps) {
  return (
    <Dialog open={request !== null} onClose={onCancel} aria-labelledby="impact-dialog-title">
      <DialogTitle id="impact-dialog-title">Changer le référent</DialogTitle>
      <DialogContent>
        <DialogContentText>{request && impactMessage(request)}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button onClick={onConfirm} variant="contained" autoFocus>
          Confirmer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
