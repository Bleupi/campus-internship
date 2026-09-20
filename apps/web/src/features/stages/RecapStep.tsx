import { Alert, Stack, Typography } from "@mui/material";
import { formatOrganismAddress, formatTutorContact } from "./format-summary";
import type { RawPeriod } from "./PeriodsStep";
import { RecapField, RecapSection, SecondaryLine } from "./StageSummaryParts";

// Deliberately no "new organism / new tutor" wording anywhere on this screen:
// whether a record already existed is an implementation detail the student
// does not need to weigh when re-reading their request (QA feedback, PR #135).
interface OrganismSummary {
  name: string;
  structureType: string;
  street: string;
  postalCode: string;
  city: string;
}

interface TutorSummary {
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phone?: string | null;
  acceptsPhoneContact: boolean;
}

interface Props {
  organism: OrganismSummary | undefined;
  tutor: TutorSummary | undefined;
  periods: RawPeriod[];
  service: string;
  projectType: string;
  motivation: string;
  mandatory: boolean;
  errorMessage: string | null;
}

export function RecapStep({
  organism,
  tutor,
  periods,
  service,
  projectType,
  motivation,
  mandatory,
  errorMessage,
}: Props) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Récapitulatif
      </Typography>

      <RecapSection title="Organisme & tuteur">
        {organism && (
          <RecapField label="Organisme">
            {organism.name}
            <SecondaryLine>{formatOrganismAddress(organism)}</SecondaryLine>
          </RecapField>
        )}
        {tutor && (
          <RecapField label="Tuteur">
            {`${tutor.firstName} ${tutor.lastName} (${tutor.jobTitle})`}
            <SecondaryLine>{formatTutorContact(tutor)}</SecondaryLine>
          </RecapField>
        )}
      </RecapSection>

      <RecapSection title="Périodes">
        {periods.map((p, index) => (
          <RecapField key={p.id} label={`Période ${index + 1}`}>
            {p.startDate} → {p.endDate}
          </RecapField>
        ))}
      </RecapSection>

      <RecapSection title="Détails">
        <RecapField label="Service">{service.trim() || "Non renseigné"}</RecapField>
        <RecapField label="Type de handicap concerné">
          {projectType.trim() || "Non renseigné"}
        </RecapField>
        <RecapField label="Stage obligatoire">{mandatory ? "Oui" : "Non"}</RecapField>
        <RecapField label="Motivation">{motivation.trim() || "Non renseignée"}</RecapField>
      </RecapSection>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
    </Stack>
  );
}
