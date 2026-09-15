import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Container, Link, TextField, Typography } from "@mui/material";
import { forgotPasswordSchema, type ForgotPasswordRequest } from "shared";
import { useForgotPassword } from "./useForgotPassword";

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await forgotPassword.mutateAsync(values);
      // BR-13: the message itself is already anti-enumeration generic — it
      // never depends on whether the email matched an account.
      setConfirmationMessage(response.message);
    } catch {
      setServerError("Une erreur est survenue, merci de réessayer.");
    }
  });

  return (
    <Container maxWidth="xs">
      <Box sx={{ mt: 8, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h4" component="h1">
          Mot de passe oublié
        </Typography>

        {confirmationMessage ? (
          <Alert severity="success">{confirmationMessage}</Alert>
        ) : (
          <Box
            component="form"
            onSubmit={onSubmit}
            noValidate
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            {serverError && <Alert severity="error">{serverError}</Alert>}

            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              {...register("email")}
              error={!!errors.email}
              helperText={errors.email?.message}
            />

            <Button type="submit" variant="contained" disabled={isSubmitting}>
              Envoyer
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
