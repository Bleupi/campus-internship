import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { CreateStageDraftInput } from "shared";
import { ApiError } from "../../lib/api-client";
import { ROUTES } from "../../routes";
import { useOrganism } from "../organisms/useOrganism";
import { OrganismTutorStep, type CreationMode } from "./OrganismTutorStep";
import { PeriodsStep, type RawPeriod } from "./PeriodsStep";
import { RecapStep } from "./RecapStep";
import { useCreateStageDraft } from "./useCreateStageDraft";
import { validatePeriods } from "./validate-periods";

type OrganismSelection = CreateStageDraftInput["organism"];
type TutorSelection = CreateStageDraftInput["tutor"];

const STEPS = ["Organisme & tuteur", "Périodes", "Détails", "Récapitulatif"];

export function NewStagePage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const createDraft = useCreateStageDraft();

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState<CreationMode>(null);
  const [organism, setOrganism] = useState<OrganismSelection | null>(null);
  const [tutor, setTutor] = useState<TutorSelection | null>(null);
  const [periods, setPeriods] = useState<RawPeriod[]>([]);
  const [service, setService] = useState("");
  const [projectType, setProjectType] = useState("");
  const [motivation, setMotivation] = useState("");
  // No default: an explicit true/false choice is required before the draft
  // can be saved (issue #113 AC — no silent default reaches the server).
  const [mandatory, setMandatory] = useState<boolean | null>(null);

  // The window is the scroll container and stays where it was when the step's
  // content is swapped: the long recap would otherwise open scrolled to its
  // bottom, right after clicking "Suivant" at the foot of the previous step.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const existingOrganismId = organism?.mode === "existing" ? organism.id : null;
  const organismDetail = useOrganism(existingOrganismId);
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

  const draftErrorMessage = !createDraft.isError
    ? null
    : createDraft.error instanceof ApiError
      ? "Une erreur est survenue lors de l'enregistrement du brouillon."
      : "Une erreur inattendue est survenue.";

  // On the first step there is no earlier step to go to, but while an inline
  // creation form is open "Précédent" backs out of it, to the search/picker.
  function handleBack() {
    if (step === 0) {
      setCreating(null);
      return;
    }
    setStep((s) => s - 1);
  }

  function handleSubmit() {
    if (!periodsResult.success || organism === null || tutor === null || mandatory === null) {
      return;
    }

    const payload: CreateStageDraftInput = {
      organism,
      tutor,
      periods: periodsResult.data,
      mandatory,
      service: service.trim() || undefined,
      projectType: projectType.trim() || undefined,
      motivation: motivation.trim() || undefined,
    };

    createDraft.mutate(payload, {
      onSuccess: () => navigate(ROUTES.DASHBOARD),
    });
  }

  return (
    <Box sx={{ maxWidth: 560, minWidth: 0 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Nouvelle demande de stage
      </Typography>
      {isMobile ? (
        // Four labelled steps side by side don't fit a phone's width and
        // push the whole page into horizontal scroll — show progress instead.
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Étape {step + 1} sur {STEPS.length} : {STEPS[step]}
          </Typography>
          <LinearProgress variant="determinate" value={((step + 1) / STEPS.length) * 100} />
        </Box>
      ) : (
        <Stepper activeStep={step} sx={{ mb: 4 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

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
        />
      )}

      {step === 1 && <PeriodsStep periods={periods} onChange={setPeriods} />}

      {step === 2 && (
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <TextField label="Service" value={service} onChange={(e) => setService(e.target.value)} />
          <TextField
            label="Type de handicap concerné"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          />
          <TextField
            label="Motivation"
            multiline
            minRows={3}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
          />
          <Typography component="legend" variant="subtitle2">
            Ce stage est-il obligatoire ?
          </Typography>
          <RadioGroup
            value={mandatory === null ? "" : String(mandatory)}
            onChange={(e) => setMandatory(e.target.value === "true")}
          >
            <FormControlLabel value="true" control={<Radio />} label="Oui" />
            <FormControlLabel value="false" control={<Radio />} label="Non" />
          </RadioGroup>
        </Stack>
      )}

      {step === 3 && periodsResult.success && mandatory !== null && (
        <RecapStep
          organism={organism?.mode === "new" ? organism.data : organismDetail.data}
          tutor={tutor?.mode === "new" ? tutor.data : existingTutor}
          periods={periods}
          service={service}
          projectType={projectType}
          motivation={motivation}
          mandatory={mandatory}
          errorMessage={draftErrorMessage}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 4 }}>
        <Button disabled={step === 0 && creating === null} onClick={handleBack}>
          Précédent
        </Button>
        {step < STEPS.length - 1 && (
          <Button variant="contained" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>
            Suivant
          </Button>
        )}
        {step === STEPS.length - 1 && (
          <Button variant="contained" disabled={createDraft.isPending} onClick={handleSubmit}>
            Enregistrer le brouillon
          </Button>
        )}
      </Stack>
    </Box>
  );
}
