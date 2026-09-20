// PROTOTYPE — "Tableau + actions groupées": one dense table, referent
// picked inline in each row, checkboxes + a sticky bar to assign one referent
// to N selected requests at once. Validate/refuse are strictly one at a time
// (never in bulk). Click a row to open everything the student provided.
import { Fragment, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { AddReferentDialog } from "./AddReferentDialog";
import {
  fmtPeriods,
  groupLabel,
  kindLabel,
  type MockReferent,
  type MockStageRequest,
} from "./mock-data";
import { buildRefusalReason, emptyRefusal, isRefusalValid, type RefusalDraft } from "./refusal";
import { RefusalFields } from "./RefusalFields";
import { ReferentSelect } from "./ReferentSelect";
import { StageInfo } from "./StageInfo";
import { StructureTypeChip } from "./StructureTypeChip";
import type { StageRequestsStore } from "./useMockStageRequests";

type TabKey = "all" | "blocked" | "ready";

export function VariantB({ store }: { store: StageRequestsStore }) {
  const { pending, referents, referentOf } = store;
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refuseTarget, setRefuseTarget] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  // A referent change waiting for the admin's confirmation (impact recap).
  const [pendingAssign, setPendingAssign] = useState<{
    targets: MockStageRequest[];
    referent: MockReferent;
    bulk: boolean;
  } | null>(null);
  // Where the "add referent" dialog was opened from: a row, or the bulk bar.
  const [addFor, setAddFor] = useState<{ ids: string[] } | null>(null);
  const [draft, setDraft] = useState<RefusalDraft>(emptyRefusal());

  const rows = useMemo(
    () =>
      pending
        .filter((r) => tab === "all" || (tab === "blocked") === !referentOf(r))
        .filter((r) =>
          `${r.student.firstName} ${r.student.lastName} ${r.organism.name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [pending, tab, query, referentOf],
  );
  const selectedRequests = pending.filter((r) => selected.includes(r.id));
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const byIds = (ids: string[]) => pending.filter((r) => ids.includes(r.id));
  const toggleExpanded = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  // Single row: applied straight away unless it also touches other live
  // requests of the student. Bulk: always shows the recap.
  function requestAssign(targets: MockStageRequest[], referent: MockReferent, bulk = false) {
    const { others } = store.impactOf(targets, referent.id);
    if (!bulk && others.length === 0) {
      store.assignReferent(targets, referent.id);
      return;
    }
    setPendingAssign({ targets, referent, bulk });
  }

  function closeRefuse() {
    setRefuseTarget(null);
    setDraft(emptyRefusal());
  }

  return (
    <Box sx={{ pb: 12 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography variant="h5" component="h1">
            Demandes de stage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {pending.length} en attente
          </Typography>
        </Box>
        <TextField
          size="small"
          label="Rechercher"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Stack>
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 1 }}>
        <Tab value="all" label={`Toutes (${pending.length})`} />
        <Tab
          value="blocked"
          label={`Sans référent (${pending.filter((r) => !referentOf(r)).length})`}
        />
        <Tab
          value="ready"
          label={`Prêtes à valider (${pending.filter((r) => referentOf(r)).length})`}
        />
      </Tabs>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allChecked}
                  indeterminate={!allChecked && rows.some((r) => selected.includes(r.id))}
                  onChange={() => setSelected(allChecked ? [] : rows.map((r) => r.id))}
                />
              </TableCell>
              <TableCell>Étudiant</TableCell>
              <TableCell>Organisme</TableCell>
              <TableCell>Période</TableCell>
              <TableCell>Semestre · type</TableCell>
              <TableCell sx={{ width: 260 }}>Référent</TableCell>
              <TableCell align="right">Décision</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const referent = referentOf(r);
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <TableRow
                    hover
                    selected={selected.includes(r.id)}
                    sx={{ "& > td": { borderBottom: open ? 0 : undefined } }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    </TableCell>
                    <TableCell onClick={() => toggleExpanded(r.id)} sx={{ cursor: "pointer" }}>
                      <Typography sx={{ fontWeight: 600 }}>
                        {r.student.lastName.toUpperCase()} {r.student.firstName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.student.promotion} · {r.previousMandatory.length} stage(s) oblig.
                        précédent(s)
                      </Typography>
                    </TableCell>
                    <TableCell onClick={() => toggleExpanded(r.id)} sx={{ cursor: "pointer" }}>
                      {r.organism.name}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {r.service ?? "Service non renseigné"}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <StructureTypeChip type={r.organism.structureType} />
                      </Box>
                    </TableCell>
                    <TableCell onClick={() => toggleExpanded(r.id)} sx={{ cursor: "pointer" }}>
                      {fmtPeriods(r)[0]}
                      {r.periods.length > 1 && (
                        <Typography variant="caption" color="text.secondary">
                          {" "}
                          (+{r.periods.length - 1})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell onClick={() => toggleExpanded(r.id)} sx={{ cursor: "pointer" }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${r.semester} · ${kindLabel(r.mandatory)}`}
                      />
                    </TableCell>
                    <TableCell>
                      <ReferentSelect
                        referents={referents}
                        value={referent}
                        onChange={(ref) => requestAssign([r], ref)}
                        onAddRequested={() => setAddFor({ ids: [r.id] })}
                        label=""
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title={referent ? "Valider" : "Assignez un référent pour valider"}>
                        <span>
                          <IconButton
                            color="success"
                            disabled={!referent}
                            onClick={() => store.validate(r.id)}
                            aria-label="Valider"
                          >
                            <CheckOutlinedIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={referent ? "Refuser…" : "Assignez un référent pour refuser"}>
                        <span>
                          <IconButton
                            color="error"
                            disabled={!referent}
                            onClick={() => setRefuseTarget(r.id)}
                            aria-label="Refuser"
                          >
                            <CloseOutlinedIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton onClick={() => toggleExpanded(r.id)} aria-label="Détails">
                        <ExpandMoreOutlinedIcon
                          sx={{ transform: open ? "rotate(180deg)" : "none" }}
                        />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 0, border: open ? undefined : 0 }}>
                      <Collapse in={open} unmountOnExit>
                        <Box sx={{ py: 2 }}>
                          <StageInfo r={r} columns={3} />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Aucune demande.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {selected.length > 0 && (
        <Paper
          elevation={6}
          sx={{
            position: "sticky",
            bottom: 80,
            mt: 2,
            p: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 2,
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <Typography sx={{ fontWeight: 600 }}>{selected.length} sélectionnée(s)</Typography>
          <Button color="inherit" variant="outlined" onClick={() => setAssignOpen(true)}>
            Assigner un référent…
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button color="inherit" onClick={() => setSelected([])}>
            Tout désélectionner
          </Button>
        </Paper>
      )}

      {/* Bulk assign */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assigner un référent à {selected.length} demande(s)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Un récapitulatif vous sera présenté avant application.
          </Typography>
          <ReferentSelect
            size="medium"
            referents={referents}
            value={null}
            onChange={(ref) => {
              setAssignOpen(false);
              requestAssign(selectedRequests, ref, true);
            }}
            onAddRequested={() => {
              setAssignOpen(false);
              setAddFor({ ids: selected });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Assignment confirmation: impact on other live requests / overwritten referents */}
      {pendingAssign &&
        (() => {
          const { targets, referent, bulk } = pendingAssign;
          const { others, overwrites } = store.impactOf(targets, referent.id);
          return (
            <Dialog open onClose={() => setPendingAssign(null)} maxWidth="sm" fullWidth>
              <DialogTitle>
                Assigner {referent.firstName} {referent.lastName}
              </DialogTitle>
              <DialogContent>
                <Stack spacing={1}>
                  <Typography>
                    {bulk
                      ? `${targets.length} demande(s) sélectionnée(s)`
                      : `${targets[0]!.student.firstName} ${targets[0]!.student.lastName} — ${groupLabel(targets[0]!)}`}
                    .
                  </Typography>
                  {overwrites > 0 && (
                    <Alert severity="warning">
                      {overwrites} assignation(s) existante(s) avec un autre référent seront
                      remplacées.
                    </Alert>
                  )}
                  {others.map((o) => (
                    <Alert key={o.student} severity="info">
                      S'applique aussi à {o.count} autre(s) demande(s) en cours de l'étudiant{" "}
                      {o.student}.
                    </Alert>
                  ))}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setPendingAssign(null)}>Annuler</Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    store.assignReferent(targets, referent.id);
                    setPendingAssign(null);
                    if (bulk) setSelected([]);
                  }}
                >
                  Confirmer
                </Button>
              </DialogActions>
            </Dialog>
          );
        })()}

      {/* Refuse (one request at a time) */}
      <Dialog open={refuseTarget !== null} onClose={closeRefuse} maxWidth="sm" fullWidth>
        <DialogTitle>Refuser la demande</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Le motif est envoyé à l'étudiant par email.
          </Typography>
          <RefusalFields draft={draft} onChange={setDraft} />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRefuse}>Annuler</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!isRefusalValid(draft)}
            onClick={() => {
              if (refuseTarget && store.refuse(refuseTarget, buildRefusalReason(draft)).ok) {
                setSelected((p) => p.filter((id) => id !== refuseTarget));
                closeRefuse();
              }
            }}
          >
            Confirmer le refus
          </Button>
        </DialogActions>
      </Dialog>

      <AddReferentDialog
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        context={
          addFor && addFor.ids.length > 1
            ? `Sera assigné aux ${addFor.ids.length} demandes sélectionnées.`
            : addFor
              ? `Sera assigné à ${byIds(addFor.ids)
                  .map((r) => `${r.student.firstName} ${r.student.lastName} (${groupLabel(r)})`)
                  .join(", ")}.`
              : undefined
        }
        onCreate={(input) => {
          const created = store.addReferent(input);
          if (addFor) requestAssign(byIds(addFor.ids), created, addFor.ids.length > 1);
        }}
      />
    </Box>
  );
}
