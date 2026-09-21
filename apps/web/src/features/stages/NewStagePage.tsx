import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateStageDraftInput } from "shared";
import { ApiError } from "../../lib/api-client";
import { ROUTES } from "../../routes";
import { StageWizard, type StageWizardValues } from "./StageWizard";
import { describeDraftSavedButNotSubmitted } from "./submit-error-message";
import { useCreateStageDraft } from "./useCreateStageDraft";
import { useSubmitStage } from "./useSubmitStage";

// Creating never offers the `edit` selection (it needs an existing draft), so
// narrowing it away here is what lets the wizard's superset type feed
// createStageDraftSchema's stricter one.
function toCreateInput(values: StageWizardValues): CreateStageDraftInput {
  const { organism, tutor } = values;
  if (organism.mode === "edit" || tutor.mode === "edit") {
    throw new Error("Editing an organism or tutor in place needs an existing draft");
  }
  return { ...values, organism, tutor };
}

export function NewStagePage() {
  const navigate = useNavigate();
  const createDraft = useCreateStageDraft();
  const submitStage = useSubmitStage();
  // Set once the draft is saved. If the submission that follows fails, a retry
  // must submit this draft, not create a second one.
  const [savedStageId, setSavedStageId] = useState<string | null>(null);

  const draftErrorMessage = !createDraft.isError
    ? null
    : createDraft.error instanceof ApiError
      ? "Une erreur est survenue lors de l'enregistrement du brouillon."
      : "Une erreur inattendue est survenue.";
  const submitErrorMessage = submitStage.isError
    ? describeDraftSavedButNotSubmitted(submitStage.error)
    : null;

  // "Enregistrer le brouillon" saves only; "Soumettre" saves, then submits the
  // saved draft through the same endpoint as the detail page, so the API's
  // gate (BR-02, completeness) checks what was actually stored.
  async function save(values: StageWizardValues, andSubmit: boolean) {
    let stageId = savedStageId;
    if (stageId === null) {
      try {
        stageId = (await createDraft.mutateAsync(toCreateInput(values))).id;
      } catch {
        return; // surfaced through createDraft.isError
      }
      setSavedStageId(stageId);
    }

    if (!andSubmit) {
      navigate(ROUTES.STAGES);
      return;
    }
    try {
      await submitStage.mutateAsync(stageId);
      navigate(ROUTES.STAGES);
    } catch {
      // surfaced through submitStage.isError; the draft stays saved
    }
  }

  return (
    <StageWizard
      title="Nouvelle demande de stage"
      onSave={save}
      saving={createDraft.isPending || submitStage.isPending}
      locked={savedStageId !== null}
      errorMessage={draftErrorMessage ?? submitErrorMessage}
    />
  );
}
