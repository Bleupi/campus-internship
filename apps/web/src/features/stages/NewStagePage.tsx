import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Divider,
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
import { useOrganism } from "../organisms/useOrganism";
import { formatOrganismAddress, formatTutorContact } from "./format-summary";
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

      {step === 3 &&
        periodsResult.success &&
        organism !== null &&
        tutor !== null &&
        mandatory !== null && (
          <Stack spacing={1.5} sx={{ maxWidth: 480 }}>
            <Typography variant="subtitle1">Récapitulatif</Typography>

            <Typography variant="subtitle2">Organisme & tuteur</Typography>
            {organism.mode === "existing" ? (
              organismDetail.data && (
                <>
                  <Typography variant="body2">{organismDetail.data.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatOrganismAddress(organismDetail.data)}
                  </Typography>
                </>
              )
            ) : (
              <>
                <Typography variant="body2">{organism.data.name} (nouvel organisme)</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatOrganismAddress(organism.data)}
                </Typography>
              </>
            )}
            {tutor.mode === "existing" ? (
              existingTutor && (
                <>
                  <Typography variant="body2">
                    {existingTutor.firstName} {existingTutor.lastName} ({existingTutor.jobTitle})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatTutorContact(existingTutor)}
                  </Typography>
                </>
              )
            ) : (
              <>
                <Typography variant="body2">
                  {tutor.data.firstName} {tutor.data.lastName} ({tutor.data.jobTitle}, nouveau
                  tuteur)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatTutorContact(tutor.data)}
                </Typography>
              </>
            )}

            <Divider />
            <Typography variant="subtitle2">Périodes</Typography>
            {periods.map((p) => (
              <Typography variant="body2" key={p.id}>
                {p.startDate} → {p.endDate}
              </Typography>
            ))}

            <Divider />
            <Typography variant="subtitle2">Détails</Typography>
            <Typography variant="body2">Service : {service.trim() || "Non renseigné"}</Typography>
            <Typography variant="body2">
              Type de handicap concerné : {projectType.trim() || "Non renseigné"}
            </Typography>
            <Typography variant="body2">
              Motivation : {motivation.trim() || "Non renseignée"}
            </Typography>
            <Typography variant="body2">
              {mandatory ? "Stage obligatoire" : "Stage optionnel"}
            </Typography>

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
