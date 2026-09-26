import { Alert, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { deriveSemester, isBeforeCurrentSchoolYear } from "shared";
import { validatePeriods } from "./validate-periods";

export interface RawPeriod {
  id: string;
  startDate: string;
  endDate: string;
}

interface Props {
  periods: RawPeriod[];
  onChange: (periods: RawPeriod[]) => void;
}

// Periods are stored as UTC midnight, so "today" is measured from the start of
// the UTC day: a period starting today is not in the past.
function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// A period starting before today is legitimate (a request filed a posteriori,
// validated orally first), so this only ever warns. A period in a school year
// that has already ended can still be saved as a draft but not submitted.
function pastPeriodWarning(periods: RawPeriod[]): string | null {
  const starts = periods
    .map((p) => new Date(p.startDate))
    .filter((start) => !Number.isNaN(start.getTime()));

  if (starts.some((start) => isBeforeCurrentSchoolYear(start))) {
    return "Cette demande porte sur l'année scolaire précédente. Vous pourrez enregistrer le brouillon, mais pas le soumettre.";
  }
  if (starts.some((start) => start.getTime() < startOfTodayUtc())) {
    return "Une période commence avant aujourd'hui. C'est possible pour une demande faite a posteriori, vérifiez simplement les dates.";
  }
  return null;
}

export function PeriodsStep({ periods, onChange }: Props) {
  const result = validatePeriods(periods);
  const filledPeriods = periods.filter((p) => p.startDate && p.endDate);
  const pastWarning = pastPeriodWarning(periods);
  const showValidation = periods.length > 0 && filledPeriods.length === periods.length;

  function updatePeriod(id: string, patch: Partial<RawPeriod>) {
    onChange(periods.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPeriod() {
    onChange([...periods, { id: crypto.randomUUID(), startDate: "", endDate: "" }]);
  }

  function removePeriod(id: string) {
    onChange(periods.filter((p) => p.id !== id));
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography variant="subtitle1">Périodes de stage</Typography>
        {result.success && (
          // Semester is derived server-side from these periods and never
          // entered by the student (BR-04b) — shown here only as a preview.
          <Typography variant="body2" color="text.secondary">
            Semestre {deriveSemester(result.data)}
          </Typography>
        )}
      </Stack>

      {periods.length === 0 && (
        <Alert severity="warning" variant="outlined">
          Au moins une période est requise.
        </Alert>
      )}
      {pastWarning && (
        <Alert severity="warning" variant="outlined">
          {pastWarning}
        </Alert>
      )}
      {showValidation && !result.success && (
        <Alert severity="error" variant="outlined">
          {result.error.issues[0]?.message ?? "Périodes invalides"}
        </Alert>
      )}

      {periods.map((period) => (
        <Stack
          key={period.id}
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <TextField
            label="Début"
            type="date"
            size="small"
            sx={{ flex: "1 1 140px" }}
            value={period.startDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => updatePeriod(period.id, { startDate: e.target.value })}
          />
          <TextField
            label="Fin (exclue à 00:00)"
            type="date"
            size="small"
            sx={{ flex: "1 1 140px" }}
            value={period.endDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => updatePeriod(period.id, { endDate: e.target.value })}
          />
          <IconButton
            size="small"
            aria-label="Supprimer la période"
            onClick={() => removePeriod(period.id)}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button
        size="small"
        startIcon={<AddOutlinedIcon />}
        sx={{ alignSelf: "flex-start" }}
        onClick={addPeriod}
      >
        Ajouter une période
      </Button>
    </Stack>
  );
}
