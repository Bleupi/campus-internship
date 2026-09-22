import type { ReactNode } from "react";
import { Alert, LinearProgress, Stack, Typography } from "@mui/material";
import {
  formatDate,
  formatPeriodRange,
  formatTotalDuration,
  mandatoryLabel,
} from "../stages/format-summary";
import { RecapField, SecondaryLine } from "../stages/StageSummaryParts";
import { useStageRequestDetail } from "./useStageRequestDetail";

const NOT_PROVIDED = "Non renseigné";

function DetailColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ flex: 1, minWidth: 220 }}>
      <Typography
        variant="subtitle1"
        sx={{ color: "primary.main", fontWeight: 700, textTransform: "uppercase" }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

// Issue #147: the "Demandes à traiter" row-expand detail, everything the
// student provided for one PENDING request, in a four-column layout
// (student, organism/service, tutor/project/motivation, periods).
export function StageRequestDetail({ stageId }: { stageId: string }) {
  const { data: detail, isPending, isError } = useStageRequestDetail(stageId, true);

  if (isPending) {
    return <LinearProgress data-testid="stage-request-detail-loading" />;
  }
  if (isError || !detail) {
    return <Alert severity="error">Impossible de charger le détail de cette demande.</Alert>;
  }

  // Nothing to show a phone-contact preference about without a phone number
  // on file: hide both lines rather than a hollow "Non renseigné" next to
  // "ne souhaite pas être contacté par téléphone".
  const showPhoneContact = detail.tutor.phone !== null || detail.tutor.acceptsPhoneContact;

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ py: 2 }}>
      <DetailColumn title="Étudiant">
        <RecapField label="Nom" labelVariant="body2">
          {`${detail.student.firstName} ${detail.student.lastName}`}
        </RecapField>
        <RecapField label="Email" labelVariant="body2">
          {detail.student.email}
        </RecapField>
        <RecapField label="Demande" labelVariant="body2">
          {`${mandatoryLabel(detail.mandatory)} · ${detail.semester} · soumise le ${formatDate(detail.submittedAt)}`}
        </RecapField>
      </DetailColumn>

      <DetailColumn title="Organisme">
        <RecapField label="Organisme" labelVariant="body2">
          {detail.organism.name}
        </RecapField>
        <RecapField label="Adresse" labelVariant="body2">
          {`${detail.organism.street}, ${detail.organism.postalCode} ${detail.organism.city}`}
        </RecapField>
        <RecapField label="Service" labelVariant="body2">
          {detail.service}
        </RecapField>
      </DetailColumn>

      <DetailColumn title="Tuteur & projet">
        <RecapField label="Tuteur" labelVariant="body2">
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
        <RecapField label="Type de handicap concerné" labelVariant="body2">
          {detail.projectType}
        </RecapField>
        <RecapField label="Motivation" labelVariant="body2">
          {detail.motivation}
        </RecapField>
      </DetailColumn>

      <DetailColumn title="Périodes">
        {detail.periods.map((period, index) => (
          <RecapField key={period.id} label={`Période ${index + 1}`} labelVariant="body2">
            {formatPeriodRange(period)}
          </RecapField>
        ))}
        <RecapField label="Durée totale" labelVariant="body2">
          {formatTotalDuration(detail.periods)}
        </RecapField>
      </DetailColumn>
    </Stack>
  );
}
