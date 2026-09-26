import { Alert, Button, LinearProgress, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Link, useSearchParams } from "react-router-dom";
import { listStagesQuerySchema, type ListStagesQuery } from "shared";
import { ROUTES } from "../../routes";
import { describeDuplicateError } from "./duplicate-error-message";
import { StageAccordionItem } from "./StageAccordionItem";
import { StagesFilters } from "./StagesFilters";
import { StagesTable } from "./StagesTable";
import { useDuplicateStage } from "./useDuplicateStage";
import { useStages } from "./useStages";

// The URL is the source of truth for filter/sort, so the browser's back button
// from a detail page returns to the list exactly as it was left. A malformed
// value (hand-edited URL) falls back to the defaults rather than reaching the API.
function parseQuery(params: URLSearchParams): ListStagesQuery {
  const parsed = listStagesQuerySchema.safeParse({
    status: params.get("status") ?? undefined,
    semester: params.get("semester") ?? undefined,
    sort: params.get("sort") ?? undefined,
  });
  return parsed.success ? parsed.data : listStagesQuerySchema.parse({});
}

function toSearchParams(query: ListStagesQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.semester) params.set("semester", query.semester);
  if (query.sort !== "startDate") params.set("sort", query.sort);
  return params;
}

export function StagesListPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [searchParams, setSearchParams] = useSearchParams();
  const query = parseQuery(searchParams);
  const { data: stages, isPending, isError } = useStages(query);
  // One mutation for the whole list, shared by the desktop table and the mobile
  // accordion: the student stays on the list and the copy appears in the refetch.
  const duplicate = useDuplicateStage();
  const handleDuplicate = (stageId: string) => duplicate.mutate(stageId);

  const updateQuery = (next: ListStagesQuery) => setSearchParams(toSearchParams(next));

  return (
    <Stack spacing={3} sx={{ maxWidth: 900, mx: "auto" }}>
      <Typography variant="h5" component="h1">
        Mes demandes de stage
      </Typography>

      <StagesFilters query={query} onChange={updateQuery} />

      {isPending && <LinearProgress />}
      {isError && <Alert severity="error">Impossible de charger vos demandes de stage.</Alert>}
      {duplicate.error && <Alert severity="error">{describeDuplicateError(duplicate.error)}</Alert>}
      {stages?.length === 0 && (
        <Typography color="text.secondary">Aucune demande de stage.</Typography>
      )}
      {stages &&
        stages.length > 0 &&
        (isMobile ? (
          <Stack spacing={1}>
            {stages.map((stage) => (
              <StageAccordionItem
                key={stage.id}
                stage={stage}
                onDuplicate={handleDuplicate}
                duplicating={duplicate.isPending}
              />
            ))}
          </Stack>
        ) : (
          <StagesTable
            stages={stages}
            onDuplicate={handleDuplicate}
            duplicating={duplicate.isPending}
          />
        ))}

      {/* Always last, whatever the list holds, so the call to action never moves. */}
      <Button
        component={Link}
        to={ROUTES.STAGE_NEW}
        variant="contained"
        startIcon={<AddOutlinedIcon />}
        fullWidth={isMobile}
        sx={{ alignSelf: isMobile ? "stretch" : "flex-end" }}
      >
        Nouvelle demande
      </Button>
    </Stack>
  );
}
