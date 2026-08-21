import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { projectTypes, structureTypes } from "../data";

export function SubmitStageScreen() {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto", bgcolor: "grey.50", p: 3 }}>
      <Card elevation={1}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" component="h1" gutterBottom>
            Nouvelle demande de stage
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Parlez-nous de ce stage ! Tous les champs sont requis pour la soumission — vous pouvez
            enregistrer un brouillon à tout moment si vous n'avez pas encore toutes les
            informations.
          </Typography>

          <Box component="form" onSubmit={(e) => e.preventDefault()}>
            <Stack spacing={4}>
              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                <Typography
                  component="legend"
                  variant="subtitle2"
                  sx={{ mb: 1.5, fontWeight: 600 }}
                >
                  Organisme d'accueil
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    id="organism-name"
                    label="Nom de l'organisme"
                    required
                    fullWidth
                    placeholder="Institut des Jeunes Sourds"
                  />
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <TextField
                        id="structure-type"
                        label="Type de structure"
                        select
                        defaultValue={structureTypes[0]}
                        fullWidth
                      >
                        {structureTypes.map((t) => (
                          <MenuItem key={t} value={t}>
                            {t}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={6}>
                      <TextField id="city" label="Ville" required fullWidth placeholder="Lyon" />
                    </Grid>
                  </Grid>
                </Stack>
              </Box>

              <Divider />

              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                <Typography
                  component="legend"
                  variant="subtitle2"
                  sx={{ mb: 1.5, fontWeight: 600 }}
                >
                  Tuteur de stage
                </Typography>
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <TextField id="tutor-first-name" label="Prénom" required fullWidth />
                    </Grid>
                    <Grid size={6}>
                      <TextField id="tutor-last-name" label="Nom" required fullWidth />
                    </Grid>
                  </Grid>
                  <TextField
                    id="tutor-email"
                    label="E-mail du tuteur"
                    type="email"
                    required
                    fullWidth
                  />
                </Stack>
              </Box>

              <Divider />

              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                <Typography
                  component="legend"
                  variant="subtitle2"
                  sx={{ mb: 1.5, fontWeight: 600 }}
                >
                  Détails du stage
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    id="project-type"
                    label="Type de handicap accompagné"
                    select
                    defaultValue={projectTypes[0]}
                    fullWidth
                  >
                    {projectTypes.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <TextField
                        id="start-date"
                        label="Début de période"
                        type="date"
                        required
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        id="end-date"
                        label="Fin de période"
                        type="date"
                        required
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    id="motivation"
                    label="Motivation"
                    required
                    fullWidth
                    multiline
                    rows={4}
                  />
                  <FormControlLabel control={<Checkbox />} label="Stage obligatoire (cursus)" />
                </Stack>
              </Box>

              <CardActions sx={{ justifyContent: "flex-end", p: 0 }}>
                <Button variant="outlined">Enregistrer le brouillon</Button>
                <Button type="submit" variant="contained">
                  Soumettre la demande
                </Button>
              </CardActions>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
