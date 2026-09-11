import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Container, Link, TextField, Typography } from "@mui/material";
import { resetPasswordSchema, type ResetPasswordRequest } from "shared";
import { ApiError } from "../../lib/api-client";
import { useResetPassword } from "./useResetPassword";

// BR-13: missing, expired, and already-consumed tokens are indistinguishable
// to the caller — one generic message covers all three, matching the
// backend's single BadRequestException (400) for all of them.
const GENERIC_RESET_ERROR = "Ce lien de réinitialisation est invalide ou a expiré.";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const resetPassword = useResetPassword();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordRequest>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await resetPassword.mutateAsync(values);
      // Never auto-logs the user in: redirect to /login, no session mutation.
      navigate("/login", { state: { successMessage: response.message } });
    } catch (error) {
      // The backend only ever rejects an invalid/expired/used token with a
      // 400 (BR-13); anything else (network failure, 500) is a genuine
      // unrelated error and shouldn't tell the user their link is bad.
      if (error instanceof ApiError && error.status === 400) {
        setServerError(GENERIC_RESET_ERROR);
      } else {
        setServerError("Une erreur est survenue, merci de réessayer.");
      }
    }
  });

  return (
    <Container maxWidth="xs">
      <Box sx={{ mt: 8, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h4" component="h1">
          Réinitialiser le mot de passe
        </Typography>

        {!token ? (
          <Alert severity="error">{GENERIC_RESET_ERROR}</Alert>
        ) : (
          <Box
            component="form"
            onSubmit={onSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            {serverError && <Alert severity="error">{serverError}</Alert>}

            <TextField
              label="Nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
              error={!!errors.newPassword}
              helperText={errors.newPassword?.message ?? "18 caractères minimum"}
            />

            <Button type="submit" variant="contained" disabled={isSubmitting}>
              Réinitialiser
            </Button>
          </Box>
        )}

        <Typography variant="body2">
          <Link component={RouterLink} to="/login">
            Retour à la connexion
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}
