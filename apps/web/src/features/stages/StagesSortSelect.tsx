import { MenuItem, TextField } from "@mui/material";
import type { StageListSort } from "shared";

const SORT_LABELS: Record<StageListSort, string> = {
  startDate: "Date de début la plus proche",
  submittedAt: "Date de soumission",
};

interface Props {
  value: StageListSort;
  onChange: (sort: StageListSort) => void;
}

// Secondary control, deliberately compact: the filters matter more (spec Q7).
export function StagesSortSelect({ value, onChange }: Props) {
  return (
    <TextField
      select
      size="small"
      label="Trier par"
      value={value}
      onChange={(event) => onChange(event.target.value as StageListSort)}
      sx={{ minWidth: 200 }}
    >
      {(Object.keys(SORT_LABELS) as StageListSort[]).map((sort) => (
        <MenuItem key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </MenuItem>
      ))}
    </TextField>
  );
}
