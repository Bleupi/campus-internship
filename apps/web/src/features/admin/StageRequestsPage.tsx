import { useState } from "react";
import {
  Alert,
  Box,
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
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import type { AdminStageRequestListItem } from "shared";
import { formatPeriodRange } from "../stages/format-summary";
import { StructureTypeLabel } from "./StructureTypeLabel";
import { useStageRequests } from "./useStageRequests";

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
                    <TableCell>Promotion</TableCell>
                    <TableCell>Organisme</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell>Période</TableCell>
                    <TableCell>Semestre</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Référent</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((request) => (
                    <TableRow key={request.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {request.student.firstName} {request.student.lastName}
                      </TableCell>
                      <TableCell>{request.student.promotion ?? "—"}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                          <Typography variant="body2">{request.organism.name}</Typography>
                          <StructureTypeLabel structureType={request.organism.structureType} />
                        </Stack>
                      </TableCell>
                      <TableCell>{request.service ?? "—"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {formatFirstPeriod(request)}
                      </TableCell>
                      <TableCell>{request.semester}</TableCell>
                      <TableCell>{request.mandatory ? "Obligatoire" : "Facultatif"}</TableCell>
                      <TableCell>
                        {request.referent ? (
                          `${request.referent.firstName} ${request.referent.lastName}`
                        ) : (
                          <Typography variant="body2" sx={{ color: "warning.main" }}>
                            Aucun référent
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
