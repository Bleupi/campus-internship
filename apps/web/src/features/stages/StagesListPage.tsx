import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Link, useSearchParams } from "react-router-dom";
import { listStagesQuerySchema, type ListStagesQuery } from "shared";
import { ROUTES } from "../../routes";
import { StageAccordionItem } from "./StageAccordionItem";
import { StageRow } from "./StageRow";
import { StagesFilters } from "./StagesFilters";
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

  return (
    <Stack spacing={3} sx={{ maxWidth: 900, mx: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="h5" component="h1">
          Mes demandes de stage
        </Typography>
        <Button
          component={Link}
          to={ROUTES.STAGE_NEW}
          variant="contained"
          startIcon={<AddOutlinedIcon />}
        >
          Nouvelle demande
        </Button>
      </Stack>

      <StagesFilters query={query} onChange={(next) => setSearchParams(toSearchParams(next))} />

      {isPending && <LinearProgress />}
      {isError && <Alert severity="error">Impossible de charger vos demandes de stage.</Alert>}
      {stages?.length === 0 && (
        <Typography color="text.secondary">Aucune demande de stage.</Typography>
      )}
      {stages && stages.length > 0 && (
        <Box
          component={isMobile ? "div" : "ul"}
          sx={{ display: "flex", flexDirection: "column", gap: isMobile ? 1 : 1.5, m: 0, p: 0 }}
        >
          {stages.map((stage) =>
            isMobile ? (
              <StageAccordionItem key={stage.id} stage={stage} />
            ) : (
              <StageRow key={stage.id} stage={stage} />
            ),
          )}
        </Box>
      )}
    </Stack>
  );
}
