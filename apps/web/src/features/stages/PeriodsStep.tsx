import { Alert, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { deriveSemester } from "shared";
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

export function PeriodsStep({ periods, onChange }: Props) {
  const result = validatePeriods(periods);
  const filledPeriods = periods.filter((p) => p.startDate && p.endDate);
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
      {periods.map((period) => (
        <Stack key={period.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            label="Début"
            type="date"
            size="small"
            value={period.startDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => updatePeriod(period.id, { startDate: e.target.value })}
          />
          <TextField
            label="Fin (exclue à 00:00)"
            type="date"
            size="small"
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

      {periods.length === 0 && (
        <Alert severity="warning" variant="outlined">
          Au moins une période est requise.
        </Alert>
      )}
      {showValidation && !result.success && (
        <Alert severity="error" variant="outlined">
          {result.error.issues[0]?.message ?? "Périodes invalides"}
        </Alert>
      )}
    </Stack>
  );
}
