import type { ReactNode } from "react";
import { Alert, LinearProgress, Stack, Typography } from "@mui/material";
import { formatPeriodRange, formatTotalDuration } from "../stages/format-summary";
import { RecapField, SecondaryLine } from "../stages/StageSummaryParts";
import { useStageRequestDetail } from "./useStageRequestDetail";

const NOT_PROVIDED = "Non renseigné";

function DetailColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ flex: 1, minWidth: 220 }}>
      <Typography
        variant="subtitle2"
        sx={{ color: "primary.main", fontWeight: 700, textTransform: "uppercase" }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

// Issue #147: the "Demandes à traiter" row-expand detail, everything the
// student provided for one PENDING request, in a three-column layout
// (organism/service, tutor/project/motivation, periods).
export function StageRequestDetail({ stageId }: { stageId: string }) {
  const { data: detail, isPending, isError } = useStageRequestDetail(stageId, true);

  if (isPending) {
    return <LinearProgress data-testid="stage-request-detail-loading" />;
  }
  if (isError || !detail) {
    return <Alert severity="error">Impossible de charger le détail de cette demande.</Alert>;
  }

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ py: 2 }}>
      <DetailColumn title="Organisme">
        <RecapField label="Organisme">{detail.organism.name}</RecapField>
        <RecapField label="Adresse">
          {`${detail.organism.street}, ${detail.organism.postalCode} ${detail.organism.city}`}
        </RecapField>
        <RecapField label="Service">{detail.service}</RecapField>
      </DetailColumn>

      <DetailColumn title="Tuteur & projet">
        <RecapField label="Tuteur">
          {`${detail.tutor.firstName} ${detail.tutor.lastName} (${detail.tutor.jobTitle})`}
          <SecondaryLine>{detail.tutor.email}</SecondaryLine>
          <SecondaryLine>{detail.tutor.phone ?? NOT_PROVIDED}</SecondaryLine>
          <SecondaryLine>
            {detail.tutor.acceptsPhoneContact
              ? "Accepte d'être contacté par téléphone"
              : "Ne souhaite pas être contacté par téléphone"}
          </SecondaryLine>
        </RecapField>
        <RecapField label="Type de handicap concerné">{detail.projectType}</RecapField>
        <RecapField label="Motivation">{detail.motivation}</RecapField>
      </DetailColumn>

      <DetailColumn title="Périodes">
        {detail.periods.map((period, index) => (
          <RecapField key={period.id} label={`Période ${index + 1}`}>
            {formatPeriodRange(period)}
          </RecapField>
        ))}
        <RecapField label="Durée totale">{formatTotalDuration(detail.periods)}</RecapField>
      </DetailColumn>
    </Stack>
  );
}
