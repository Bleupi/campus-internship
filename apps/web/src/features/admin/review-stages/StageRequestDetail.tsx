import type { ReactNode } from "react";
import { Alert, LinearProgress, Stack, Typography } from "@mui/material";
import type { AdminPreviousMandatoryStage } from "shared";
import {
  formatDate,
  formatPeriodRange,
  formatTotalDuration,
  mandatoryLabel,
} from "../../stages/format-summary";
import { RecapField, SecondaryLine } from "../../stages/StageSummaryParts";
import { StructureTypeLabel } from "./StructureTypeLabel";
import { useStageRequestDetail } from "./useStageRequestDetail";

const NOT_PROVIDED = "Non renseigné";

function Column({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={3} sx={{ flex: 1, minWidth: 220 }}>
      {children}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" sx={{ color: "primary.main", fontWeight: 700 }}>
        {title}
      </Typography>
      <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
        {children}
      </Stack>
    </Stack>
  );
}

// Issue #154: one row of the student's history of previously VALIDATED
// mandatory stages, read from each stage's frozen snapshot (BR-08) — so a
// later edit to the live organism or the student's current promotion never
// changes what is shown here.
function PreviousMandatoryStageRow({ stage }: { stage: AdminPreviousMandatoryStage }) {
  return (
    <RecapField
      label={`${stage.promotion} · ${stage.semester} · ${stage.schoolYear}`}
      labelVariant="body2"
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <StructureTypeLabel structureType={stage.organism.structureType} />
        <Typography component="span" variant="body1">
          {stage.organism.name}
        </Typography>
      </Stack>
      <SecondaryLine>{stage.service}</SecondaryLine>
    </RecapField>
  );
}

function PreviousMandatoryStagesSection({ stages }: { stages: AdminPreviousMandatoryStage[] }) {
  return (
    <Section title="Stages obligatoires précédents">
      {stages.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Aucun stage obligatoire validé pour le moment.
        </Typography>
      ) : (
        stages.map((stage, index) => <PreviousMandatoryStageRow key={index} stage={stage} />)
      )}
    </Section>
  );
}

// Issue #147: the "Demandes à traiter" row-expand detail, everything the
// student provided for one PENDING request, matching the prototype's
// three-column layout — student | organism + tutor | project + periods —
// with each of those five grouping its own titled section.
export function StageRequestDetail({ stageId }: { stageId: string }) {
  const { data: detail, isPending, isError } = useStageRequestDetail(stageId, true);

  if (isPending) {
    return <LinearProgress data-testid="stage-request-detail-loading" />;
  }
  if (isError || !detail) {
    return <Alert severity="error">Impossible de charger le détail de cette demande.</Alert>;
  }

  // Nothing to show a phone-contact preference about without a phone number
  // on file: hide both lines rather than a hollow "Non renseigné" next to a
  // phone-contact statement. `acceptsPhoneContact` is settable independently
  // of `phone` on the student side (OrganismTutorForms.tsx), so this must not
  // OR it in — a null phone hides the section regardless.
  const showPhoneContact = detail.tutor.phone !== null;

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ py: 2 }}>
      <Column>
        <Section title="Étudiant">
          <RecapField label="Nom" labelVariant="body2">
            {`${detail.student.firstName} ${detail.student.lastName}`}
          </RecapField>
          <RecapField label="Email" labelVariant="body2">
            {detail.student.email}
          </RecapField>
          <RecapField label="Demande" labelVariant="body2">
            {`${mandatoryLabel(detail.mandatory)} · ${detail.semester} · soumise le ${formatDate(detail.submittedAt)}`}
          </RecapField>
        </Section>
        <PreviousMandatoryStagesSection stages={detail.previousMandatoryStages} />
      </Column>

      <Column>
        <Section title="Organisme d'accueil">
          <RecapField label="Organisme" labelVariant="body2">
            {detail.organism.name}
          </RecapField>
          <RecapField label="Adresse" labelVariant="body2">
            {`${detail.organism.street}, ${detail.organism.postalCode} ${detail.organism.city}`}
          </RecapField>
          <RecapField label="Service" labelVariant="body2">
            {detail.service}
          </RecapField>
        </Section>
        <Section title="Tuteur">
          <RecapField label="Nom" labelVariant="body2">
            {`${detail.tutor.firstName} ${detail.tutor.lastName} (${detail.tutor.jobTitle})`}
            <SecondaryLine>{detail.tutor.email}</SecondaryLine>
            {showPhoneContact && (
              <>
                <SecondaryLine>{detail.tutor.phone ?? NOT_PROVIDED}</SecondaryLine>
                <SecondaryLine>
                  {detail.tutor.acceptsPhoneContact
                    ? "Accepte d'être contacté par téléphone"
                    : "Ne souhaite pas être contacté par téléphone"}
                </SecondaryLine>
              </>
            )}
          </RecapField>
        </Section>
      </Column>

      <Column>
        <Section title="Projet">
          <RecapField label="Type de handicap concerné" labelVariant="body2">
            {detail.projectType}
          </RecapField>
          <RecapField label="Motivation" labelVariant="body2">
            {detail.motivation}
          </RecapField>
        </Section>
        <Section title={`Périodes (${formatTotalDuration(detail.periods)} au total)`}>
          {detail.periods.map((period, index) => (
            <RecapField key={period.id} label={`Période ${index + 1}`} labelVariant="body2">
              {formatPeriodRange(period)}
            </RecapField>
          ))}
        </Section>
      </Column>
    </Stack>
  );
}
