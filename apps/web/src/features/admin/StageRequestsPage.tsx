import { Fragment, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import type { AdminStageRequestListItem } from "shared";
import { formatPeriodRange, mandatoryLabel } from "../stages/format-summary";
import { StageRequestDetail } from "./StageRequestDetail";
import { StructureTypeLabel } from "./StructureTypeLabel";
import { useStageRequests } from "./useStageRequests";

const DETAIL_COLUMN_COUNT = 6;

type TabKey = "all" | "withoutReferent" | "ready";

const hasReferent = (request: AdminStageRequestListItem) => request.referent !== null;

const TABS: {
  key: TabKey;
  label: string;
  matches: (request: AdminStageRequestListItem) => boolean;
}[] = [
  { key: "all", label: "Toutes", matches: () => true },
  { key: "withoutReferent", label: "Sans référent", matches: (request) => !hasReferent(request) },
  // A referent is the only thing the admin may still be missing to decide
  // (BR-03): the student already had to complete everything else to submit.
  { key: "ready", label: "Prêtes à valider", matches: hasReferent },
];

// Case- and accent-insensitive, so "ines" finds "Inès".
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesSearch(request: AdminStageRequestListItem, query: string): boolean {
  const { firstName, lastName } = request.student;
  return [`${firstName} ${lastName}`, `${lastName} ${firstName}`, request.organism.name].some(
    (haystack) => normalize(haystack).includes(query),
  );
}

function tabLabel(tab: (typeof TABS)[number], requests: AdminStageRequestListItem[]): string {
  const matchCount = requests.filter(tab.matches).length;
  return `${tab.label} (${matchCount})`;
}

function formatFirstPeriod(request: AdminStageRequestListItem): string {
  if (!request.firstPeriod) return "Aucune période";
  const range = formatPeriodRange(request.firstPeriod);
  return request.periodCount > 1 ? `${range} (+${request.periodCount - 1})` : range;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <Typography sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
        Aucune demande ne correspond.
      </Typography>
    );
  }
  return (
    <Stack spacing={1} sx={{ alignItems: "center", color: "text.secondary", py: 6 }}>
      <TaskAltOutlinedIcon fontSize="large" />
      <Typography variant="h6">Aucune demande à traiter</Typography>
      <Typography>Toutes les demandes soumises ont été traitées.</Typography>
    </Stack>
  );
}

// Issue #146: read-only list of the submitted (PENDING) stage requests, oldest
// submission first (the API already orders them). Tabs, counts and search are
// client-side — no pagination in V1. Desktop only.
export function StageRequestsPage() {
  const { data: requests, isLoading, isError } = useStageRequests();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <Typography sx={{ color: "text.secondary" }}>Chargement…</Typography>;
  }
  if (isError || !requests) {
    return <Alert severity="error">Impossible de charger les demandes à traiter.</Alert>;
  }

  const query = normalize(search.trim());
  const activeMatches = TABS.find((tab) => tab.key === activeTab)!.matches;
  const visible = requests.filter(
    (request) => activeMatches(request) && matchesSearch(request, query),
  );

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Demandes à traiter
      </Typography>

      {requests.length === 0 ? (
        <EmptyState filtered={false} />
      ) : (
        <>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
          >
            <Tabs value={activeTab} onChange={(_, value: TabKey) => setActiveTab(value)}>
              {TABS.map((tab) => (
                <Tab key={tab.key} value={tab.key} label={tabLabel(tab, requests)} />
              ))}
            </Tabs>
            <TextField
              type="search"
              size="small"
              label="Rechercher un étudiant ou un organisme"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ width: 340 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>

          {visible.length === 0 ? (
            <EmptyState filtered />
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Étudiant</TableCell>
                    <TableCell>Organisme</TableCell>
                    <TableCell>Période</TableCell>
                    <TableCell>Demande</TableCell>
                    <TableCell>Référent</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((request) => {
                    const expanded = expandedId === request.id;
                    return (
                      <Fragment key={request.id}>
                        <TableRow
                          hover
                          onClick={() => setExpandedId(expanded ? null : request.id)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>
                            <Stack spacing={0.25} sx={{ alignItems: "flex-start" }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {request.student.firstName} {request.student.lastName}
                              </Typography>
                              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {request.student.promotion}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                              <Typography variant="body2">{request.organism.name}</Typography>
                              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {request.service}
                              </Typography>
                              <StructureTypeLabel structureType={request.organism.structureType} />
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            {formatFirstPeriod(request)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={request.mandatory ? "primary" : "default"}
                              label={`${mandatoryLabel(request.mandatory)} · ${request.semester}`}
                            />
                          </TableCell>
                          <TableCell>
                            {request.referent ? (
                              `${request.referent.firstName} ${request.referent.lastName}`
                            ) : (
                              <Typography variant="body2" sx={{ color: "warning.main" }}>
                                Aucun référent
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ width: 40 }}>
                            <IconButton
                              size="small"
                              aria-label={expanded ? "Réduire" : "Développer"}
                              aria-expanded={expanded}
                            >
                              {expanded ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell sx={{ p: 0 }} colSpan={DETAIL_COLUMN_COUNT}>
                              <Box sx={{ px: 2 }}>
                                <StageRequestDetail stageId={request.id} />
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
