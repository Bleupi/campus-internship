import { useState } from "react";
import { Alert, Button, LinearProgress, Stack } from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { Link, useNavigate, useParams } from "react-router-dom";
import { STAGE_CONFLICT_CODES, type StageDetailResponse } from "shared";
import { ApiError } from "../../lib/api-client";
import { ROUTES, stageDetailPath } from "../../routes";
import { StageWizard, type StageWizardValues } from "./StageWizard";
import { describeDraftSavedButNotSubmitted } from "./submit-error-message";
import { readStageConflict } from "./stage-conflict";
import { useStage } from "./useStage";
import { useSubmitStage } from "./useSubmitStage";
import { useUpdateStageDraft } from "./useUpdateStageDraft";

// The wizard reads its `initialDraft` once, on mount. Reloading after a stale
// version remounts it (through its key) on the freshly fetched draft.
function EditStageForm({ draft, onReload }: { draft: StageDetailResponse; onReload: () => void }) {
  const navigate = useNavigate();
  const updateDraft = useUpdateStageDraft(draft.id);
  const submitStage = useSubmitStage();
  // Once the PATCH went through, the draft's version moved on: a retry after a
  // failed submission must only submit, never PATCH again with the old version.
  const [saved, setSaved] = useState(false);

  const conflict = updateDraft.isError ? readStageConflict(updateDraft.error) : null;
  const draftErrorMessage = !updateDraft.isError
    ? null
    : conflict
      ? conflict.message
      : updateDraft.error instanceof ApiError
        ? "Une erreur est survenue lors de l'enregistrement du brouillon."
        : "Une erreur inattendue est survenue.";
  const submitErrorMessage = submitStage.isError
    ? describeDraftSavedButNotSubmitted(submitStage.error)
    : null;

  async function save(values: StageWizardValues, andSubmit: boolean) {
    if (!saved) {
      try {
        // BR-09: the version read with the draft. No `semester`: the server
        // re-derives it from the periods (BR-04b).
        await updateDraft.mutateAsync({ ...values, version: draft.version });
      } catch {
        return; // surfaced through updateDraft.isError
      }
      setSaved(true);
    }

    if (!andSubmit) {
      navigate(stageDetailPath(draft.id));
      return;
    }
    try {
      await submitStage.mutateAsync(draft.id);
      navigate(ROUTES.STAGES);
    } catch {
      // surfaced through submitStage.isError; the draft stays saved
    }
  }

  return (
    <StageWizard
      title="Modifier la demande de stage"
      initialDraft={draft}
      onSave={save}
      saving={updateDraft.isPending || submitStage.isPending}
      locked={saved}
      errorMessage={draftErrorMessage ?? submitErrorMessage}
      errorAction={
        conflict?.code === STAGE_CONFLICT_CODES.VERSION_CONFLICT ? (
          <Button color="inherit" size="small" onClick={onReload}>
            Recharger
          </Button>
        ) : undefined
      }
    />
  );
}

export function EditStagePage() {
  const { id = "" } = useParams();
  const { data: stage, isPending, error, refetch } = useStage(id);
  // Set by a reload: the draft fetched at that moment, and the wizard key that
  // restarts it on that draft.
  const [reloaded, setReloaded] = useState<{ draft: StageDetailResponse; generation: number }>();

  async function reload() {
    const { data } = await refetch();
    if (data) setReloaded({ draft: data, generation: (reloaded?.generation ?? 0) + 1 });
  }

  const draft = reloaded?.draft ?? stage;

  return (
    <Stack spacing={2}>
      <Button
        component={Link}
        to={ROUTES.STAGES}
        startIcon={<ArrowBackOutlinedIcon />}
        sx={{ alignSelf: "flex-start" }}
      >
        Mes demandes
      </Button>

      {isPending && <LinearProgress />}
      {error && (
        <Alert severity="error">
          {error instanceof ApiError && error.status === 404
            ? "Demande introuvable."
            : "Impossible de charger cette demande de stage."}
        </Alert>
      )}
      {draft && draft.status !== "DRAFT" && (
        <Alert severity="info">Seul un brouillon peut être modifié.</Alert>
      )}
      {draft && draft.status === "DRAFT" && (
        <EditStageForm key={reloaded?.generation ?? 0} draft={draft} onReload={reload} />
      )}
    </Stack>
  );
}
