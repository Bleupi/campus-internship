import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Container, Link, TextField, Typography } from "@mui/material";
import { loginSchema, type LoginRequest } from "shared";
import { ApiError } from "../../lib/api-client";
import { useLogin } from "./useLogin";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login.mutateAsync(values);
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setServerError("Identifiants incorrects.");
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
          Se connecter
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
          autoComplete="current-password"
          {...register("password")}
          error={!!errors.password}
          helperText={errors.password?.message}
        />

        <Button type="submit" variant="contained" disabled={isSubmitting}>
          Se connecter
        </Button>

        <Typography variant="body2">
          Pas encore de compte ?{" "}
          <Link component={RouterLink} to="/signup">
            S'inscrire
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}
