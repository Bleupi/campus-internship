import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import type { CreateStageDraftInput } from "shared";
import { ApiError } from "../../lib/api-client";
import { ROUTES } from "../../routes";
import { OrganismTutorStep } from "./OrganismTutorStep";
import { PeriodsStep, type RawPeriod } from "./PeriodsStep";
import { useCreateStageDraft } from "./useCreateStageDraft";
import { validatePeriods } from "./validate-periods";

type OrganismSelection = CreateStageDraftInput["organism"];
type TutorSelection = CreateStageDraftInput["tutor"];

const STEPS = ["Organisme & tuteur", "Périodes", "Détails", "Récapitulatif"];

export function NewStagePage() {
  const navigate = useNavigate();
  const createDraft = useCreateStageDraft();

  const [step, setStep] = useState(0);
  const [organism, setOrganism] = useState<OrganismSelection | null>(null);
  const [tutor, setTutor] = useState<TutorSelection | null>(null);
  const [periods, setPeriods] = useState<RawPeriod[]>([]);
  const [service, setService] = useState("");
  const [projectType, setProjectType] = useState("");
  const [motivation, setMotivation] = useState("");
  // No default: an explicit true/false choice is required before the draft
  // can be saved (issue #113 AC — no silent default reaches the server).
  const [mandatory, setMandatory] = useState<boolean | null>(null);

  const periodsResult = validatePeriods(periods);
  const stepValid = [
    organism !== null && tutor !== null,
    periodsResult.success,
    mandatory !== null,
    true,
  ][step]!;

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
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Nouvelle demande de stage
      </Typography>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {step === 0 && (
        <OrganismTutorStep
          organism={organism}
          tutor={tutor}
          onChange={(o, t) => {
            setOrganism(o);
            setTutor(t);
          }}
        />
      )}

      {step === 1 && <PeriodsStep periods={periods} onChange={setPeriods} />}

      {step === 2 && (
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <TextField
            label="Service (facultatif)"
            value={service}
            onChange={(e) => setService(e.target.value)}
          />
          <TextField
            label="Type de handicap concerné (facultatif)"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          />
          <TextField
            label="Motivation (facultatif)"
            multiline
            minRows={3}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
          />
          <Typography component="legend" variant="subtitle2">
            Stage obligatoire ?
          </Typography>
          <RadioGroup
            value={mandatory === null ? "" : String(mandatory)}
            onChange={(e) => setMandatory(e.target.value === "true")}
          >
            <FormControlLabel
              value="true"
              control={<Radio />}
              label="Oui, ce stage est obligatoire"
            />
            <FormControlLabel
              value="false"
              control={<Radio />}
              label="Non, ce stage est optionnel"
            />
          </RadioGroup>
        </Stack>
      )}

      {step === 3 &&
        periodsResult.success &&
        organism !== null &&
        tutor !== null &&
        mandatory !== null && (
          <Stack spacing={1} sx={{ maxWidth: 480 }}>
            <Typography variant="subtitle1">Récapitulatif</Typography>
            <Typography variant="body2">
              {organism.mode === "existing" ? "Organisme existant sélectionné" : organism.data.name}
            </Typography>
            <Typography variant="body2">
              {tutor.mode === "existing"
                ? "Tuteur existant sélectionné"
                : `${tutor.data.firstName} ${tutor.data.lastName}`}
            </Typography>
            <Typography variant="body2">
              {mandatory ? "Stage obligatoire" : "Stage optionnel"}
            </Typography>
            {periods.map((p) => (
              <Typography variant="body2" key={p.id}>
                {p.startDate} → {p.endDate}
              </Typography>
            ))}
            {createDraft.isError && (
              <Alert severity="error">
                {createDraft.error instanceof ApiError
                  ? "Une erreur est survenue lors de l'enregistrement du brouillon."
                  : "Une erreur inattendue est survenue."}
              </Alert>
            )}
          </Stack>
        )}

      <Stack direction="row" spacing={1} sx={{ mt: 4 }}>
        <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
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
