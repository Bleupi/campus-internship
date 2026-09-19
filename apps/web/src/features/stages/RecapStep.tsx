import type { ReactNode } from "react";
import { Alert, Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { formatOrganismAddress, formatTutorContact } from "./format-summary";
import type { RawPeriod } from "./PeriodsStep";

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

// Three visual levels so nothing the student typed can be mistaken for chrome:
// section title (bold, brand colour) > field label (small, muted) > value
// (regular body text, full contrast).
function RecapSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" component="section">
      <CardContent>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ color: "primary.main", fontWeight: 700, mb: 1.5 }}
        >
          {title}
        </Typography>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function RecapField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography
        component="dt"
        variant="caption"
        sx={{ display: "block", color: "text.secondary", fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="body1"
        sx={{ m: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function SecondaryLine({ children }: { children: ReactNode }) {
  return (
    <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
      {children}
    </Typography>
  );
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
