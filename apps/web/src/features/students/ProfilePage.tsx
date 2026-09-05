import { Fragment, useState, type ChangeEvent } from "react";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
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

// Issue #68 review: shown for every unset profile field in read mode.
const NOT_SET_PLACEHOLDER = "non renseigné";

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

type ProfileFile = { type: FileType; mimeType: string; uploadedAt: string };

function fileFor(files: ProfileFile[], type: FileType) {
  return files.find((file) => file.type === type);
}

// An untouched, empty field must submit as null (a valid "no value"), not ""
// (which the shared schema deliberately rejects for phone/personalEmail).
// Applied in the resolver below rather than via each field's `setValueAs`:
// react-hook-form only runs `setValueAs` for fields the user actually typed
// into — a field seeded empty by the profile's initial `values` and never
// touched reaches the resolver as "" regardless, which the schema then
// rejects (surfacing a "invalid phone/email" error the student never caused).
function emptyToNull(value: string | null | undefined) {
  return value === "" ? null : value;
}

function describeFile(file: ProfileFile | undefined) {
  return file
    ? `envoyée le ${new Date(file.uploadedAt).toLocaleDateString("fr-FR")}`
    : "aucun fichier";
}

function IdentityContactSection({
  editing,
  register,
  errors,
  phoneField,
  profile,
}: {
  editing: boolean;
  register: UseFormRegister<UpdateProfileRequest>;
  errors: FieldErrors<UpdateProfileRequest>;
  phoneField: ReturnType<UseFormRegister<UpdateProfileRequest>>;
  profile: { promotion: string | null; phone: string | null; personalEmail: string | null };
}) {
  return (
    <Card variant="outlined" component="section">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Identité &amp; contact
          </Typography>

          {editing ? (
            <Stack spacing={2}>
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
                {...phoneField}
                onChange={(event) => {
                  event.target.value = event.target.value.replace(/[^\d+]/g, "");
                  phoneField.onChange(event);
                }}
                error={!!errors.phone}
                helperText={errors.phone?.message}
              />
              <TextField
                label="Email personnel"
                type="email"
                fullWidth
                {...register("personalEmail")}
                error={!!errors.personalEmail}
                helperText={errors.personalEmail?.message}
              />
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Typography>Promotion : {profile.promotion ?? NOT_SET_PLACEHOLDER}</Typography>
              <Typography>Téléphone : {profile.phone ?? NOT_SET_PLACEHOLDER}</Typography>
              <Typography>
                Email personnel : {profile.personalEmail ?? NOT_SET_PLACEHOLDER}
              </Typography>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
            Cette adresse est aussi utilisée pour vous envoyer des notifications par email.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DocumentsSection({
  editing,
  idPhoto,
  insuranceCertificate,
  certificateConsentChecked,
  onCertificateConsentChange,
  onIdPhotoChange,
  onCertificateChange,
}: {
  editing: boolean;
  idPhoto: ProfileFile | undefined;
  insuranceCertificate: ProfileFile | undefined;
  certificateConsentChecked: boolean;
  onCertificateConsentChange: (checked: boolean) => void;
  onIdPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCertificateChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Card variant="outlined" component="section">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Documents
          </Typography>

          {editing ? (
            <Stack spacing={2}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography>Photo d'identité : {describeFile(idPhoto)}</Typography>
                <Button component="label" variant="outlined" size="small">
                  Remplacer
                  <input
                    type="file"
                    hidden
                    data-testid="id-photo-input"
                    accept={ID_PHOTO_MIME_TYPES.join(",")}
                    onChange={onIdPhotoChange}
                  />
                </Button>
              </Stack>

              <Stack spacing={1}>
                <Typography
                  id="certificate-content-checklist"
                  variant="body2"
                  color="text.secondary"
                  data-testid="certificate-content-checklist"
                >
                  Votre document doit couvrir : vos stages et l'année scolaire en cours. Le document
                  varie selon votre assureur, ce qui compte, c'est que ces deux points y figurent,
                  peu importe la formulation exacte.
                </Typography>
                <Stack
                  direction="row"
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography>
                    Attestation de responsabilité civile scolaire :{" "}
                    {describeFile(insuranceCertificate)}
                  </Typography>
                  <Button component="label" variant="outlined" size="small">
                    Remplacer
                    <input
                      type="file"
                      hidden
                      data-testid="insurance-certificate-input"
                      accept={INSURANCE_CERTIFICATE_MIME_TYPES.join(",")}
                      onChange={onCertificateChange}
                    />
                  </Button>
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={certificateConsentChecked}
                      onChange={(event) => onCertificateConsentChange(event.target.checked)}
                      slotProps={{
                        input: { "aria-describedby": "certificate-content-checklist" },
                      }}
                    />
                  }
                  label="Je confirme que mon attestation couvre bien mes stages et l'année scolaire en cours."
                />
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Typography>Photo d'identité : {describeFile(idPhoto)}</Typography>
              <Typography>
                Attestation de responsabilité civile scolaire : {describeFile(insuranceCertificate)}
              </Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadIdPhoto = useUploadFile(uploadIdPhotoRequest);
  const uploadInsuranceCertificate = useUploadFile(uploadInsuranceCertificateRequest);

  const [isEditing, setIsEditing] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // Issue #65: nudge, not a verifiable guarantee — client-side only, never persisted.
  const [certificateConsentChecked, setCertificateConsentChecked] = useState(false);
  // Tracks "a new certificate was uploaded during this edit session" — distinct from the
  // checkbox itself, which resets after every upload and can otherwise be freely toggled.
  // Uploading is never gated on this; only saving the rest of the form is.
  const [certificateReplacedThisSession, setCertificateReplacedThisSession] = useState(false);
  // Uploading a new certificate is never blocked by the checkbox — only
  // saving the rest of the form is, until the student re-confirms it.
  const certificateConfirmationPending =
    certificateReplacedThisSession && !certificateConsentChecked;

  // BR-06: EXPIRED is a hard-block state too (lazy yearly rollover at
  // login) — same forced edit form as INCOMPLETE, see ProfilePage.test.tsx.
  const mustComplete = !!profile && blocksNavigation(profile.profileStatus);
  const editing = isEditing ?? mustComplete;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileRequest>({
    resolver: (values, context, options) =>
      zodResolver(updateProfileSchema)(
        {
          ...values,
          phone: emptyToNull(values.phone),
          personalEmail: emptyToNull(values.personalEmail),
        },
        context,
        options,
      ),
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
      onSuccess: () => {
        setIsEditing(false);
        setCertificateConsentChecked(false);
        setCertificateReplacedThisSession(false);
      },
      onError: () => setServerError("Une erreur est survenue, merci de réessayer."),
    });
  };

  const onSubmit = handleSubmit((values) => {
    // Belt-and-suspenders: the Enregistrer button is already disabled while this
    // is true, but onSubmit shouldn't trust a UI affordance to enforce the rule.
    if (certificateConfirmationPending) return;
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

  const submitCertificate = (file: File) => {
    setServerError(null);
    uploadInsuranceCertificate.mutate(file, {
      // Only reset consent on success: an unrelated upload failure shouldn't force the
      // student to re-tick the checkbox just to retry the same file.
      onSuccess: () => {
        setCertificateConsentChecked(false);
        setCertificateReplacedThisSession(true);
      },
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
    submitCertificate(file);
  };

  const cancelPendingAction = () => {
    // Canceling means the candidate file was never adopted — the live certificate
    // (and whatever consent state it already had) is unaffected either way.
    setPendingAction(null);
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === "promotion") {
      applyUpdate(pendingAction.values);
    } else {
      submitCertificate(pendingAction.file);
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
    !insuranceCertificate && "votre attestation de responsabilité civile scolaire",
  ].filter((item): item is string => !!item);

  const phoneField = register("phone");

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
            votre promotion et de déposer une nouvelle attestation de responsabilité civile
            scolaire.
          </Alert>
        )}

        {profile.profileStatus === "INCOMPLETE" && missingItems.length > 0 && (
          <Alert severity="warning">
            Complétez votre dossier. Votre profil est incomplet, il manque :{" "}
            {missingItems.join(", ")}.
          </Alert>
        )}

        {serverError && <Alert severity="error">{serverError}</Alert>}

        <Box
          component="form"
          onSubmit={onSubmit}
          noValidate
          sx={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          <IdentityContactSection
            editing={editing}
            register={register}
            errors={errors}
            phoneField={phoneField}
            profile={profile}
          />

          <DocumentsSection
            editing={editing}
            idPhoto={idPhoto}
            insuranceCertificate={insuranceCertificate}
            certificateConsentChecked={certificateConsentChecked}
            onCertificateConsentChange={setCertificateConsentChecked}
            onIdPhotoChange={handleIdPhotoChange}
            onCertificateChange={handleCertificateChange}
          />

          <Stack spacing={1}>
            <Stack direction="row" spacing={2}>
              {editing ? (
                <Fragment key="editing-actions">
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isSubmitting || certificateConfirmationPending}
                  >
                    Enregistrer
                  </Button>
                  {!mustComplete && (
                    <Button
                      onClick={() => {
                        setIsEditing(false);
                        setCertificateConsentChecked(false);
                        setCertificateReplacedThisSession(false);
                      }}
                    >
                      Annuler
                    </Button>
                  )}
                </Fragment>
              ) : (
                // A distinct `key` (vs. the "editing-actions" fragment above) forces React to
                // unmount this button rather than mutate the same DOM node in place. Without it,
                // clicking Modifier reused this exact button element for "Enregistrer": React
                // flipped its `type` from "button" to "submit" while the browser's click was still
                // being processed, so the click's default action fired as a real form submission —
                // silently saving the untouched profile and bouncing straight back to read mode.
                <Button
                  key="modifier-button"
                  variant="outlined"
                  onClick={() => {
                    setIsEditing(true);
                    setCertificateReplacedThisSession(false);
                  }}
                >
                  Modifier
                </Button>
              )}
            </Stack>
            {certificateConfirmationPending && (
              <Typography variant="body2" color="error">
                Confirmez que votre nouvelle attestation couvre bien vos stages et l'année scolaire
                en cours avant d'enregistrer.
              </Typography>
            )}
          </Stack>
        </Box>
      </Box>

      <Dialog open={pendingAction !== null} onClose={cancelPendingAction}>
        <DialogTitle>Confirmer la modification</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Votre profil est actuellement validé. Cette action le repassera en attente de validation
            par l'administration. Confirmez-vous ?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelPendingAction}>Annuler</Button>
          <Button onClick={confirmPendingAction} variant="contained" autoFocus>
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
