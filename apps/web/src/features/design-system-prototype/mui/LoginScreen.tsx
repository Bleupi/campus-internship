import { Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from "@mui/material";

export function LoginScreen() {
  return (
    <Box
      sx={{
        minHeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.50",
        p: 3,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 420 }} elevation={2}>
        <CardContent sx={{ p: 5 }}>
          <Typography variant="h6" component="h1" gutterBottom>
            Gestion des stages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Content de vous revoir ! Connectez-vous pour retrouver vos demandes de stage.
          </Typography>
          <Box
            component="form"
            aria-label="Formulaire de connexion"
            onSubmit={(e) => e.preventDefault()}
          >
            <Stack spacing={3}>
              <TextField
                id="email"
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                required
                fullWidth
                placeholder="prenom.nom@etu.univ.fr"
              />
              <TextField
                id="password"
                label="Mot de passe"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large">
                Se connecter
              </Button>
              <Link href="#" underline="hover" variant="body2" sx={{ textAlign: "center" }}>
                Mot de passe oublié ?
              </Link>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
