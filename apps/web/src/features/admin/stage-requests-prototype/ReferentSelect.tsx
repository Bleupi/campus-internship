// PROTOTYPE — shared referent picker with a "+ Ajouter un référent" escape
// hatch. Each variant decides *where* to put it; the control itself is common.
import { Autocomplete, TextField } from "@mui/material";
import type { MockReferent } from "./mock-data";

const ADD = { id: "__add__", firstName: "", lastName: "", email: "" } satisfies MockReferent;

export function ReferentSelect({
  referents,
  value,
  onChange,
  onAddRequested,
  size = "small",
  label = "Référent",
  autoFocus,
}: {
  referents: MockReferent[];
  value: MockReferent | null;
  onChange: (referent: MockReferent) => void;
  onAddRequested: () => void;
  size?: "small" | "medium";
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <Autocomplete
      size={size}
      options={[...[...referents].sort((a, b) => a.lastName.localeCompare(b.lastName)), ADD]}
      value={value}
      openOnFocus
      noOptionsText="Aucun référent"
      getOptionLabel={(o) => (o.id === ADD.id ? "" : `${o.firstName} ${o.lastName}`)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(options, state) => {
        const q = state.inputValue.toLowerCase();
        return options.filter(
          (o) => o.id === ADD.id || `${o.firstName} ${o.lastName}`.toLowerCase().includes(q),
        );
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return option.id === ADD.id ? (
          <li key={key} {...rest} style={{ fontWeight: 600, color: "#8A1538" }}>
            + Ajouter un référent…
          </li>
        ) : (
          <li key={key} {...rest}>
            {option.firstName} {option.lastName}
          </li>
        );
      }}
      onChange={(_, option) => {
        if (!option) return;
        if (option.id === ADD.id) onAddRequested();
        else onChange(option);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          placeholder={referents.length === 0 ? "Aucun référent — en ajouter un" : "Choisir…"}
        />
      )}
      sx={{ minWidth: 220 }}
    />
  );
}
