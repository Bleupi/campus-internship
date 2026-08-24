import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Container, Link, TextField, Typography } from "@mui/material";
import { signupSchema, type SignupRequest } from "shared";
import { ApiError } from "../../lib/api-client";
import { useSignup } from "./useSignup";

export function SignupPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupRequest>({ resolver: zodResolver(signupSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signup.mutateAsync(values);
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError("Un compte existe déjà avec cette adresse email.");
      } else {
        setServerError("Une erreur est survenue, merci de réessayer.");
      }
    }
  });

  return (
    <Container maxWidth="xs">
      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
        sx={{ mt: 8, display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Typography variant="h4" component="h1">
          Créer un compte
        </Typography>

        {serverError && <Alert severity="error">{serverError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          {...register("email")}
          error={!!errors.email}
          helperText={errors.email?.message}
        />
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          {...register("password")}
          error={!!errors.password}
          helperText={errors.password?.message ?? "18 caractères minimum"}
        />
        <TextField
          label="Prénom"
          autoComplete="given-name"
          {...register("firstName")}
          error={!!errors.firstName}
          helperText={errors.firstName?.message}
        />
        <TextField
          label="Nom"
          autoComplete="family-name"
          {...register("lastName")}
          error={!!errors.lastName}
          helperText={errors.lastName?.message}
        />

        <Button type="submit" variant="contained" disabled={isSubmitting}>
          S'inscrire
        </Button>

        <Typography variant="body2">
          Déjà un compte ?{" "}
          <Link component={RouterLink} to="/login">
            Se connecter
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}
