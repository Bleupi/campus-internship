import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { statusLabels, stageRows, type StageStatus } from "../data";

const statusColor: Record<StageStatus, "default" | "warning" | "success" | "error"> = {
  DRAFT: "default",
  PENDING: "warning",
  VALIDATED: "success",
  REFUSED: "error",
};

export function DashboardScreen() {
  return (
    <Box sx={{ maxWidth: 960, mx: "auto", bgcolor: "grey.50", p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h6" component="h1">
            Mes demandes de stage
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Suivez l'avancement de vos stages ci-dessous.
          </Typography>
        </Box>
        <Button variant="contained">Nouvelle demande</Button>
      </Stack>
      <TableContainer component={Paper} elevation={1}>
        <Table aria-label="Liste des demandes de stage de l'étudiant">
          <TableHead>
            <TableRow>
              <TableCell>Année / semestre</TableCell>
              <TableCell>Organisme</TableCell>
              <TableCell>Période</TableCell>
              <TableCell>Obligatoire</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="right">
                <Box component="span" sx={visuallyHidden}>
                  Actions
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stageRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  {row.schoolYear} · {row.semester}
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 600 }}>{row.organismName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.city}
                  </Typography>
                </TableCell>
                <TableCell>{row.periodLabel}</TableCell>
                <TableCell>{row.mandatory ? "Oui" : "Non"}</TableCell>
                <TableCell>
                  <Chip
                    label={statusLabels[row.status]}
                    color={statusColor[row.status]}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small">Voir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

const visuallyHidden = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
} as const;
