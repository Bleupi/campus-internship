import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  blocksNavigation,
  ID_PHOTO_MIME_TYPES,
  INSURANCE_CERTIFICATE_MIME_TYPES,
  updateProfileSchema,
  type FileType,
  type UpdateProfileRequest,
} from "shared";
import {
  uploadIdPhoto as uploadIdPhotoRequest,
  uploadInsuranceCertificate as uploadInsuranceCertificateRequest,
} from "./api";
import { useProfile } from "./useProfile";
import { useUpdateProfile } from "./useUpdateProfile";
import { useUploadFile } from "./useUploadFile";

const PROFILE_STATUS_LABELS: Record<string, string> = {
  INCOMPLETE: "Incomplet",
  PENDING_VALIDATION: "En attente de validation",
  VALID: "Validé",
  EXPIRED: "Expiré",
};

// MUI's own semantic palette, independent of the brand accent colors
// (ADR-0017: "status/semantic colors ... use MUI's own semantic palette").
const PROFILE_STATUS_COLORS: Record<string, "warning" | "info" | "success" | "error" | "default"> =
  {
    INCOMPLETE: "warning",
    PENDING_VALIDATION: "info",
    VALID: "success",
    EXPIRED: "error",
  };

type PendingAction =
  { type: "promotion"; values: UpdateProfileRequest } | { type: "certificate"; file: File };

function fileFor(
  files: { type: FileType; mimeType: string; uploadedAt: string }[],
  type: FileType,
) {
  return files.find((file) => file.type === type);
}

export function ProfilePage() {
  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadIdPhoto = useUploadFile(uploadIdPhotoRequest);
  const uploadInsuranceCertificate = useUploadFile(uploadInsuranceCertificateRequest);

  const [isEditing, setIsEditing] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // BR-06: EXPIRED is a hard-block state too (lazy yearly rollover at
  // login) — same forced edit form as INCOMPLETE, see ProfilePage.test.tsx.
  const mustComplete = !!profile && blocksNavigation(profile.profileStatus);
  const editing = isEditing ?? mustComplete;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileSchema),
    values: profile
      ? {
          promotion: profile.promotion ?? undefined,
          phone: profile.phone ?? "",
          personalEmail: profile.personalEmail ?? "",
        }
      : undefined,
  });

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  if (isError || !profile) {
    return (
      <Container maxWidth="sm">
        <Alert severity="error" sx={{ mt: 8 }}>
          Impossible de charger le profil.
        </Alert>
      </Container>
    );
  }

  const applyUpdate = (values: UpdateProfileRequest) => {
    setServerError(null);
    updateProfile.mutate(values, {
      onSuccess: () => setIsEditing(false),
      onError: () => setServerError("Une erreur est survenue, merci de réessayer."),
    });
  };

  const onSubmit = handleSubmit((values) => {
    const promotionChanged =
      values.promotion !== undefined && values.promotion !== profile.promotion;
    if (profile.profileStatus === "VALID" && promotionChanged) {
      setPendingAction({ type: "promotion", values });
      return;
    }
    applyUpdate(values);
  });

  const handleIdPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setServerError(null);
    uploadIdPhoto.mutate(file, {
      onError: () => setServerError("Une erreur est survenue, merci de réessayer."),
    });
  };

  const handleCertificateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (profile.profileStatus === "VALID") {
      setPendingAction({ type: "certificate", file });
      return;
    }
    setServerError(null);
    uploadInsuranceCertificate.mutate(file, {
      onError: () => setServerError("Une erreur est survenue, merci de réessayer."),
    });
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    setServerError(null);
    if (pendingAction.type === "promotion") {
      applyUpdate(pendingAction.values);
    } else {
      uploadInsuranceCertificate.mutate(pendingAction.file, {
        onError: () => setServerError("Une erreur est survenue, merci de réessayer."),
      });
    }
    setPendingAction(null);
  };

  const idPhoto = fileFor(profile.files, "ID_PHOTO");
  const insuranceCertificate = fileFor(profile.files, "INSURANCE_CERTIFICATE");

  // ADR-0004: INCOMPLETE means "missing fields or files" — spell out which
  // ones, rather than a generic "complete your profile" message.
  const missingItems = [
    !profile.promotion && "votre promotion",
    !idPhoto && "votre photo d'identité",
    !insuranceCertificate && "votre attestation d'assurance",
  ].filter((item): item is string => !!item);

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h4" component="h1">
            Mon profil
          </Typography>
          <Chip
            data-testid="profile-status-chip"
            color={PROFILE_STATUS_COLORS[profile.profileStatus] ?? "default"}
            label={PROFILE_STATUS_LABELS[profile.profileStatus] ?? profile.profileStatus}
          />
        </Stack>

        {profile.profileStatus === "EXPIRED" && (
          <Alert severity="warning">
            Votre dossier doit être renouvelé pour la nouvelle année scolaire : merci de confirmer
            votre promotion et de déposer une nouvelle attestation d'assurance.
          </Alert>
        )}

        {profile.profileStatus === "INCOMPLETE" && missingItems.length > 0 && (
          <Alert severity="warning">
            Complétez votre dossier. Votre profil est incomplet, il manque :{" "}
            {missingItems.join(", ")}.
          </Alert>
        )}

        {serverError && <Alert severity="error">{serverError}</Alert>}

        {editing ? (
          <Box
            component="form"
            onSubmit={onSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <TextField
              select
              label="Promotion"
              slotProps={{ select: { native: true } }}
              {...register("promotion")}
              error={!!errors.promotion}
              helperText={errors.promotion?.message}
            >
              <option value="" />
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </TextField>
            <TextField
              label="Téléphone"
              {...register("phone")}
              error={!!errors.phone}
              helperText={errors.phone?.message}
            />
            <TextField
              label="Email personnel"
              type="email"
              {...register("personalEmail")}
              error={!!errors.personalEmail}
              helperText={errors.personalEmail?.message}
            />

            <Stack direction="row" spacing={2}>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Enregistrer
              </Button>
              {!mustComplete && <Button onClick={() => setIsEditing(false)}>Annuler</Button>}
            </Stack>
          </Box>
        ) : (
          <Stack spacing={1}>
            <Typography>Promotion : {profile.promotion ?? "—"}</Typography>
            <Typography>Téléphone : {profile.phone ?? "—"}</Typography>
            <Typography>Email personnel : {profile.personalEmail ?? "—"}</Typography>
            <Box>
              <Button variant="outlined" onClick={() => setIsEditing(true)}>
                Modifier
              </Button>
            </Box>
          </Stack>
        )}

        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Documents
          </Typography>

          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography>
              Photo d'identité :{" "}
              {idPhoto
                ? `envoyée le ${new Date(idPhoto.uploadedAt).toLocaleDateString("fr-FR")}`
                : "aucun fichier"}
            </Typography>
            <Button component="label" variant="outlined" size="small">
              Remplacer
              <input
                type="file"
                hidden
                data-testid="id-photo-input"
                accept={ID_PHOTO_MIME_TYPES.join(",")}
                onChange={handleIdPhotoChange}
              />
            </Button>
          </Stack>

          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography>
              Attestation d'assurance :{" "}
              {insuranceCertificate
                ? `envoyée le ${new Date(insuranceCertificate.uploadedAt).toLocaleDateString("fr-FR")}`
                : "aucun fichier"}
            </Typography>
            <Button component="label" variant="outlined" size="small">
              Remplacer
              <input
                type="file"
                hidden
                data-testid="insurance-certificate-input"
                accept={INSURANCE_CERTIFICATE_MIME_TYPES.join(",")}
                onChange={handleCertificateChange}
              />
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Dialog open={pendingAction !== null} onClose={() => setPendingAction(null)}>
        <DialogTitle>Confirmer la modification</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Votre profil est actuellement validé. Cette action le repassera en attente de validation
            par l'administration. Confirmez-vous ?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAction(null)}>Annuler</Button>
          <Button onClick={confirmPendingAction} variant="contained" autoFocus>
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
