import { MenuItem, Stack, TextField } from "@mui/material";
import type { ListStagesQuery, Semester, StageListSort, StageStatus } from "shared";
import { SEMESTERS, STAGE_STATUSES } from "shared";
import { SEMESTER_LABELS, STAGE_STATUS_LABELS } from "./stage-labels";

const SORT_LABELS: Record<StageListSort, string> = {
  startDate: "Date de début la plus proche",
  submittedAt: "Date de soumission",
};

interface Props {
  query: ListStagesQuery;
  onChange: (next: ListStagesQuery) => void;
}

// Status, semester and sort live together as compact dropdowns (chosen
// prototype): they are used occasionally, so they stay out of the way.
export function StagesFilters({ query, onChange }: Props) {
  return (
    <Stack
      role="group"
      aria-label="Filtres et tri"
      direction="row"
      sx={{ flexWrap: "wrap", gap: 2 }}
    >
      <TextField
        select
        size="small"
        label="Statut"
        value={query.status ?? "ALL"}
        onChange={(event) => {
          const value = event.target.value as StageStatus | "ALL";
          onChange({ ...query, status: value === "ALL" ? undefined : value });
        }}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="ALL">Tous</MenuItem>
        {STAGE_STATUSES.map((status) => (
          <MenuItem key={status} value={status}>
            {STAGE_STATUS_LABELS[status]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Semestre"
        value={query.semester ?? "ALL"}
        onChange={(event) => {
          const value = event.target.value as Semester | "ALL";
          onChange({ ...query, semester: value === "ALL" ? undefined : value });
        }}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="ALL">Tous</MenuItem>
        {SEMESTERS.map((semester) => (
          <MenuItem key={semester} value={semester}>
            {SEMESTER_LABELS[semester]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Trier par"
        value={query.sort}
        onChange={(event) => onChange({ ...query, sort: event.target.value as StageListSort })}
        sx={{ minWidth: 220 }}
      >
        {(Object.keys(SORT_LABELS) as StageListSort[]).map((sort) => (
          <MenuItem key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
