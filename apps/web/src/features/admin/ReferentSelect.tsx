import { Autocomplete, TextField } from "@mui/material";
import type { ReferentListItem } from "shared";

// Issue #148: inline picker for "Demandes à traiter" — all non-archived
// referents, sorted by last name (no workload hint, #144). No "add a
// referent" escape hatch here yet (a later ticket); this control is built so
// that option can be added without reshaping it (prototype-derived,
// prototype/admin-stage-requests's ReferentSelect).
export function ReferentSelect({
  referents,
  value,
  onChange,
  disabled,
  loading,
}: {
  referents: ReferentListItem[];
  value: ReferentListItem | null;
  onChange: (referent: ReferentListItem) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Autocomplete
      size="small"
      options={[...referents].sort((a, b) => a.lastName.localeCompare(b.lastName))}
      value={value}
      disabled={disabled}
      loading={loading}
      openOnFocus
      noOptionsText="Aucun référent"
      getOptionLabel={(option) => `${option.firstName} ${option.lastName}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, option) => {
        if (option) onChange(option);
      }}
      renderInput={(params) => <TextField {...params} placeholder="Choisir un référent" />}
      sx={{ minWidth: 200 }}
    />
  );
}
