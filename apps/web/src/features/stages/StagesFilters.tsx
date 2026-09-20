import { Box, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { ListStagesQuery, Semester, StageStatus } from "shared";
import { SEMESTERS, STAGE_STATUSES } from "shared";
import { SEMESTER_LABELS, STAGE_STATUS_LABELS } from "./stage-labels";

interface Props {
  query: ListStagesQuery;
  onChange: (next: ListStagesQuery) => void;
}

// Filters are the primary controls: full-size toggle groups, always visible
// (the sort is a separate compact select in the page header).
export function StagesFilters({ query, onChange }: Props) {
  // MUI's exclusive group reports `null` when the selected button is clicked
  // again: that is "clear this filter", the same as picking "Tous".
  const setStatus = (_: unknown, value: StageStatus | "ALL" | null) =>
    onChange({ ...query, status: value === "ALL" || value === null ? undefined : value });
  const setSemester = (_: unknown, value: Semester | "ALL" | null) =>
    onChange({ ...query, semester: value === "ALL" || value === null ? undefined : value });

  return (
    <Stack spacing={2}>
      <Box sx={{ overflowX: "auto" }}>
        <ToggleButtonGroup
          exclusive
          color="primary"
          aria-label="Filtrer par statut"
          value={query.status ?? "ALL"}
          onChange={setStatus}
        >
          <ToggleButton value="ALL">Tous</ToggleButton>
          {STAGE_STATUSES.map((status) => (
            <ToggleButton key={status} value={status}>
              {STAGE_STATUS_LABELS[status]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <ToggleButtonGroup
          exclusive
          color="primary"
          aria-label="Filtrer par semestre"
          value={query.semester ?? "ALL"}
          onChange={setSemester}
        >
          <ToggleButton value="ALL">Tous</ToggleButton>
          {SEMESTERS.map((semester) => (
            <ToggleButton key={semester} value={semester}>
              {SEMESTER_LABELS[semester]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    </Stack>
  );
}
