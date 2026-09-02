import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError } from "../../lib/api-client";
import { buildRejectReason, REJECT_REASONS } from "./reject-reason";
import { useCertificateQueue } from "./useCertificateQueue";
import { useRejectProfile, useValidateProfile } from "./useProfileActions";
import { useStudentCertificate } from "./useStudentCertificate";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

const CONFLICT_TOAST_MESSAGE = "Déjà traité par un autre administrateur.";
const GENERIC_ERROR_TOAST_MESSAGE = "Une erreur est survenue, réessayez.";

// Issue #43: certificate view + Valider/Refuser, completing the split-pane
// queue built in #42. Right pane now streams the certificate inline (Blob
// object URL, ADR-0024) and drives both admin-triggered ProfileStatus
// transitions (#13's endpoints, unchanged). Desktop only, same as #42.
export function CertificateQueuePage() {
  const { data: entries, isLoading, isError } = useCertificateQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedReasons, setCheckedReasons] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const validateMutation = useValidateProfile();
  const rejectMutation = useRejectProfile();

  const selected = entries?.find((entry) => entry.studentId === selectedId) ?? null;
  const certificateStudentId = selected?.certificate ? selected.studentId : null;
  const {
    objectUrl: certificateUrl,
    isLoading: certificateLoading,
    isError: certificateError,
  } = useStudentCertificate(certificateStudentId);

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  if (isError || !entries) {
    return (
      <Alert severity="error" sx={{ mt: 4 }}>
        Impossible de charger la file d'attente.
      </Alert>
    );
  }

  function selectStudent(studentId: string | null) {
    setSelectedId(studentId);
    setCheckedReasons([]);
    setFreeText("");
  }

  function nextIdAfter(studentId: string): string | null {
    const currentEntries = entries ?? [];
    const index = currentEntries.findIndex((entry) => entry.studentId === studentId);
    if (index === -1) return null;
    return currentEntries[index + 1]?.studentId ?? currentEntries[index - 1]?.studentId ?? null;
  }

  // Shared by handleValidate/handleReject below: run the transition, then
  // either auto-advance to the next student (success, or a non-blocking 409
  // — see useProfileActions.ts) or surface a generic retry toast.
  async function runTransition(studentId: string, action: () => Promise<unknown>) {
    const nextId = nextIdAfter(studentId);
    try {
      await action();
      selectStudent(nextId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setToast(CONFLICT_TOAST_MESSAGE);
        selectStudent(nextId);
      } else {
        setToast(GENERIC_ERROR_TOAST_MESSAGE);
      }
    }
  }

  async function handleValidate() {
    if (!selected) return;
    await runTransition(selected.studentId, () => validateMutation.mutateAsync(selected.studentId));
  }

  async function handleReject() {
    if (!selected) return;
    const reason = buildRejectReason(checkedReasons, freeText);
    await runTransition(selected.studentId, () =>
      rejectMutation.mutateAsync({ studentId: selected.studentId, reason }),
    );
  }

  function toggleReason(reason: string) {
    setCheckedReasons((previous) =>
      previous.includes(reason)
        ? previous.filter((checked) => checked !== reason)
        : [...previous, reason],
    );
  }

  const actionPending = validateMutation.isPending || rejectMutation.isPending;
  // A checked reason means the admin has started building a rejection —
  // Valider is disabled so the two actions can't be triggered on
  // contradictory intent at once.
  const validerDisabled = checkedReasons.length > 0 || actionPending;
  const refuserDisabled =
    (checkedReasons.length === 0 && freeText.trim().length === 0) || actionPending;

  return (
    <Box sx={{ display: "flex", gap: 3 }}>
      <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: "divider" }}>
        <Typography variant="h4" component="h1" sx={{ px: 2, pb: 1 }}>
          Certificats à valider
        </Typography>
        {entries.length === 0 ? (
          <Typography sx={{ px: 2, color: "text.secondary" }}>
            Aucun certificat en attente de validation.
          </Typography>
        ) : (
          <List>
            {entries.map((entry) => (
              <ListItemButton
                key={entry.studentId}
                selected={entry.studentId === selectedId}
                onClick={() => selectStudent(entry.studentId)}
              >
                <ListItemText
                  primary={`${entry.firstName} ${entry.lastName}`}
                  secondary={`${entry.promotion ?? "—"} · soumis le ${formatDate(entry.waitingSince)}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, pt: 1 }}>
        {selected ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="h6" component="h2">
              {selected.firstName} {selected.lastName}
            </Typography>
            <Typography>Promotion : {selected.promotion ?? "—"}</Typography>
            <Typography>
              En attente de validation depuis le {formatDate(selected.waitingSince)}
            </Typography>
            <Typography>
              Certificat :{" "}
              {selected.certificate
                ? `envoyé le ${formatDate(selected.certificate.uploadedAt)}`
                : "aucun certificat valide actuellement"}
            </Typography>

            {selected.certificate &&
              (certificateLoading ? (
                <Typography sx={{ color: "text.secondary" }}>Chargement du certificat…</Typography>
              ) : certificateError ? (
                <Alert severity="error">Impossible de charger le certificat.</Alert>
              ) : certificateUrl ? (
                <Box
                  component="iframe"
                  title="Aperçu du certificat"
                  src={certificateUrl}
                  sx={{ width: "100%", height: 500, border: 1, borderColor: "divider" }}
                />
              ) : null)}

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Motif de refus</Typography>
              <FormGroup>
                {REJECT_REASONS.map((reason) => (
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
              <TextField
                label="Précision (facultatif)"
                fullWidth
                multiline
                minRows={2}
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                sx={{ mt: 1 }}
              />
            </Box>

            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={handleValidate} disabled={validerDisabled}>
                Valider
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={refuserDisabled}
                onClick={handleReject}
              >
                Refuser
              </Button>
            </Stack>
          </Box>
        ) : (
          <Typography sx={{ color: "text.secondary" }}>
            Sélectionnez un étudiant dans la liste pour voir son dossier.
          </Typography>
        )}
      </Box>

      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast}
      />
    </Box>
  );
}
