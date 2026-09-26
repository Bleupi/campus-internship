import { useEffect, useState, type ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import type { StageDetailResponse, StagePeriods, UpdateStageDraftInput } from "shared";
import { useOrganism } from "../../../organisms/useOrganism";
import { DetailsStep } from "./steps/DetailsStep";
import { OrganismTutorStep, type CreationMode } from "./steps/OrganismTutorStep";
import { PeriodsStep, type RawPeriod } from "./steps/PeriodsStep";
import { RecapStep } from "./steps/RecapStep";
import { SubmissionGateAlerts } from "../../submit/SubmissionGateAlerts";
import { useSubmissionGate } from "../../submit/useSubmissionGate";
import { validatePeriods } from "./steps/validate-periods";
import { WIZARD_STEPS } from "./wizard-steps";
import { WizardProgress } from "./WizardProgress";

// Superset of what creation accepts: `edit` (correct the organism/tutor the
// draft already points to, in place) is only ever produced when the wizard was
// opened on an existing draft.
export type OrganismSelection = UpdateStageDraftInput["organism"];
export type TutorSelection = UpdateStageDraftInput["tutor"];

// What the wizard hands back to its wrapper: validated periods, an explicit
// mandatory choice, and the three optional texts already trimmed (absent when
// blank). The wrapper decides whether that becomes a POST or a PATCH.
export interface StageWizardValues {
  organism: OrganismSelection;
  tutor: TutorSelection;
  periods: StagePeriods;
  mandatory: boolean;
  service?: string;
  projectType?: string;
  motivation?: string;
}

interface Props {
  title: string;
  // Set when reopening a draft: the wizard starts pre-filled from it.
  initialDraft?: StageDetailResponse;
  // "Enregistrer le brouillon" (false) or "Soumettre" (true).
  onSave: (values: StageWizardValues, andSubmit: boolean) => void;
  saving: boolean;
  // The draft is already saved (only its submission failed): going back to
  // edit would no longer be what the wrapper is going to persist.
  locked: boolean;
  errorMessage: string | null;
  errorAction?: ReactNode;
}

// The stored dates are UTC midnights; the date inputs want "YYYY-MM-DD".
function toRawPeriods(draft: StageDetailResponse): RawPeriod[] {
  return draft.periods.map((period) => ({
    id: period.id,
    startDate: period.startDate.slice(0, 10),
    endDate: period.endDate.slice(0, 10),
  }));
}

export function StageWizard({
  title,
  initialDraft,
  onSave,
  saving,
  locked,
  errorMessage,
  errorAction,
}: Props) {
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState<CreationMode>(null);
  const [organism, setOrganism] = useState<OrganismSelection | null>(
    initialDraft ? { mode: "existing", id: initialDraft.organism.id } : null,
  );
  const [tutor, setTutor] = useState<TutorSelection | null>(
    initialDraft ? { mode: "existing", id: initialDraft.tutor.id } : null,
  );
  const [periods, setPeriods] = useState<RawPeriod[]>(
    initialDraft ? toRawPeriods(initialDraft) : [],
  );
  const [service, setService] = useState(initialDraft?.service ?? "");
  const [projectType, setProjectType] = useState(initialDraft?.projectType ?? "");
  const [motivation, setMotivation] = useState(initialDraft?.motivation ?? "");
  // No default: an explicit true/false choice is required before the draft
  // can be saved (issue #113 AC — no silent default reaches the server).
  const [mandatory, setMandatory] = useState<boolean | null>(initialDraft?.mandatory ?? null);

  // The window is the scroll container and stays where it was when the step's
  // content is swapped: the long recap would otherwise open scrolled to its
  // bottom, right after clicking "Suivant" at the foot of the previous step.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // An edited organism is still fetched: its tutors are what the picker and the
  // recap read. Its own fields come from the selection, not from this cache.
  const organismDetail = useOrganism(
    organism !== null && organism.mode !== "new" ? organism.id : null,
  );
  const existingTutor =
    tutor?.mode === "existing"
      ? organismDetail.data?.tutors.find((t) => t.id === tutor.id)
      : undefined;

  const periodsResult = validatePeriods(periods);
  const stepValid = [
    organism !== null && tutor !== null,
    periodsResult.success,
    mandatory !== null,
    true,
  ][step]!;

  // On the first step there is no earlier step to go to, but while an inline
  // form is open "Précédent" backs out of it, to the search/picker.
  function handleBack() {
    if (step === 0) {
      setCreating(null);
      return;
    }
    setStep((s) => s - 1);
  }

  function save(andSubmit: boolean) {
    if (!periodsResult.success || organism === null || tutor === null || mandatory === null) {
      return;
    }
    onSave(
      {
        organism,
        tutor,
        periods: periodsResult.data,
        mandatory,
        service: service.trim() || undefined,
        projectType: projectType.trim() || undefined,
        motivation: motivation.trim() || undefined,
      },
      andSubmit,
    );
  }

  const gate = useSubmissionGate({
    hasOrganism: organism !== null,
    hasTutor: tutor !== null,
    service,
    projectType,
    motivation,
    periods: periodsResult.success ? periodsResult.data : [],
  });

  const recapOrganism = organism && "data" in organism ? organism.data : organismDetail.data;
  const recapTutor = tutor && "data" in tutor ? tutor.data : existingTutor;

  return (
    <Box sx={{ maxWidth: 560, minWidth: 0 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {title}
      </Typography>
      <WizardProgress step={step} />

      {step === 0 && (
        <OrganismTutorStep
          organism={organism}
          tutor={tutor}
          onChange={(o, t) => {
            setOrganism(o);
            setTutor(t);
          }}
          creating={creating}
          onCreatingChange={setCreating}
          draftRows={initialDraft && { organism: initialDraft.organism, tutor: initialDraft.tutor }}
        />
      )}

      {step === 1 && <PeriodsStep periods={periods} onChange={setPeriods} />}

      {step === 2 && (
        <DetailsStep
          service={service}
          projectType={projectType}
          motivation={motivation}
          mandatory={mandatory}
          onServiceChange={setService}
          onProjectTypeChange={setProjectType}
          onMotivationChange={setMotivation}
          onMandatoryChange={setMandatory}
        />
      )}

      {step === 3 && periodsResult.success && mandatory !== null && (
        <RecapStep
          organism={recapOrganism}
          tutor={recapTutor}
          periods={periods}
          service={service}
          projectType={projectType}
          motivation={motivation}
          mandatory={mandatory}
          errorMessage={errorMessage}
          errorAction={errorAction}
        />
      )}
      {step === 3 && (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <SubmissionGateAlerts blockers={gate.blockers} profileFailed={gate.profileFailed} />
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 4 }}>
        <Button disabled={(step === 0 && creating === null) || locked} onClick={handleBack}>
          Précédent
        </Button>
        {step < WIZARD_STEPS.length - 1 && (
          <Button variant="contained" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>
            Suivant
          </Button>
        )}
        {step === WIZARD_STEPS.length - 1 && (
          <>
            <Button variant="outlined" disabled={saving} onClick={() => save(false)}>
              Enregistrer le brouillon
            </Button>
            <Button
              variant="contained"
              startIcon={<SendOutlinedIcon />}
              disabled={!gate.canSubmit || saving}
              onClick={() => save(true)}
            >
              Soumettre
            </Button>
          </>
        )}
      </Stack>
    </Box>
  );
}
