import {
  Alert,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ReferentAssignmentsItem } from "shared";
import { useReferentAssignments } from "./useReferentAssignments";

// One <tbody> per referent, labelled with their name: the referent cell spans
// every student row, so the referent sits on one side and their students on
// the other.
function ReferentGroup({ referent }: { referent: ReferentAssignmentsItem }) {
  const name = `${referent.firstName} ${referent.lastName}`;
  const rowSpan = Math.max(referent.students.length, 1);
  const referentCell = (
    <TableCell rowSpan={rowSpan} sx={{ fontWeight: 600, verticalAlign: "top" }}>
      {name}
    </TableCell>
  );

  return (
    <TableBody aria-label={name} sx={{ borderTop: 2, borderColor: "divider" }}>
      {referent.students.length === 0 ? (
        <TableRow>
          {referentCell}
          <TableCell colSpan={3} sx={{ color: "text.secondary" }}>
            Aucun étudiant assigné
          </TableCell>
        </TableRow>
      ) : (
        referent.students.map((student, index) => (
          <TableRow key={student.id}>
            {index === 0 && referentCell}
            <TableCell>{student.lastName}</TableCell>
            <TableCell>{student.firstName}</TableCell>
            <TableCell sx={{ color: student.promotion ? undefined : "text.secondary" }}>
              {student.promotion ?? "Non renseignée"}
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  );
}

// Temporary read-only overview: each referent with the students assigned to
// them, all school years and semesters combined.
export function ReferentAssignmentsPage() {
  const { data: referents, isLoading, isError } = useReferentAssignments();

  if (isLoading) {
    return <Typography sx={{ color: "text.secondary" }}>Chargement…</Typography>;
  }
  if (isError || !referents) {
    return <Alert severity="error">Impossible de charger les référents et leurs étudiants.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Référents et étudiants assignés
      </Typography>
      {referents.length === 0 ? (
        <Typography sx={{ color: "text.secondary" }}>Aucun référent.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Référent</TableCell>
                <TableCell>Nom</TableCell>
                <TableCell>Prénom</TableCell>
                <TableCell>Promotion</TableCell>
              </TableRow>
            </TableHead>
            {referents.map((referent) => (
              <ReferentGroup key={referent.id} referent={referent} />
            ))}
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
