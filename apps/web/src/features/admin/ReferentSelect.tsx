import { Autocomplete, Box, TextField, createFilterOptions } from "@mui/material";
import type { ReferentListItem } from "shared";

// Issue #150: sentinel option for the "add a referent" escape hatch. Never
// becomes the value — picking it calls onAddRequested instead of onChange.
const ADD_OPTION: ReferentListItem = { id: "__add__", firstName: "", lastName: "" };

const isAddOption = (option: ReferentListItem) => option === ADD_OPTION;

const filterReferents = createFilterOptions<ReferentListItem>();

// Issue #148: inline picker for "Demandes à traiter" — all non-archived
// referents, sorted by last name (no workload hint, #144). Issue #150: the
// last option, always offered whatever is typed, opens the "add a referent"
// form (prototype-derived, prototype/admin-stage-requests's ReferentSelect).
export function ReferentSelect({
  referents,
  value,
  onChange,
  onAddRequested,
  disabled,
  loading,
}: {
  referents: ReferentListItem[];
  value: ReferentListItem | null;
  onChange: (referent: ReferentListItem) => void;
  onAddRequested: () => void;
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
      getOptionLabel={(option) =>
        isAddOption(option) ? "" : `${option.firstName} ${option.lastName}`
      }
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(options, state) => [...filterReferents(options, state), ADD_OPTION]}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return isAddOption(option) ? (
          <Box component="li" key={key} {...rest} sx={{ fontWeight: 600, color: "primary.main" }}>
            + Ajouter un référent…
          </Box>
        ) : (
          <li key={key} {...rest}>
            {option.firstName} {option.lastName}
          </li>
        );
      }}
      onChange={(_, option) => {
        if (!option) return;
        if (isAddOption(option)) onAddRequested();
        else onChange(option);
      }}
      renderInput={(params) => <TextField {...params} placeholder="Choisir un référent" />}
      sx={{ minWidth: 200 }}
    />
  );
}
