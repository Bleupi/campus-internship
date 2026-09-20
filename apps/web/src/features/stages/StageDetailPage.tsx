import { Alert, AlertTitle, Button, LinearProgress, Stack, Typography } from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Link, useLocation, useParams } from "react-router-dom";
import type { StageDetailResponse } from "shared";
import { ApiError } from "../../lib/api-client";
import { ROUTES, stageEditPath } from "../../routes";
import {
  formatDate,
  formatOrganismAddress,
  formatPeriodRange,
  formatTutorContact,
} from "./format-summary";
import { SEMESTER_LABELS, formatStageKind } from "./stage-labels";
import { StageStatusChip } from "./StageStatusChip";
import { RecapField, RecapSection, SecondaryLine } from "./StageSummaryParts";
import { SubmitStageSection } from "./SubmitStageSection";
import { useStage } from "./useStage";

// A draft has no referent yet by design: it is derived once the request is
// submitted (or the admin assigns one), so "non assigné" would read as a fault.
function referentLabel(stage: StageDetailResponse) {
  if (stage.referent) return `${stage.referent.firstName} ${stage.referent.lastName}`;
  return stage.status === "DRAFT"
    ? "Sera attribué lors de la soumission du stage ou par l'administrateur"
    : "non assigné";
}

export function StageDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { data: stage, isPending, error } = useStage(id);
  const backSearch = (location.state as { from?: string } | null)?.from ?? "";

  const backLink = (
    <Button
      component={Link}
      to={{ pathname: ROUTES.STAGES, search: backSearch }}
      startIcon={<ArrowBackOutlinedIcon />}
      sx={{ alignSelf: "flex-start" }}
    >
      Mes demandes
    </Button>
  );

  return (
    <Stack spacing={2} sx={{ maxWidth: 700, mx: "auto" }}>
      {backLink}

      {isPending && <LinearProgress />}
      {error && (
        <Alert severity="error">
          {error instanceof ApiError && error.status === 404
            ? "Demande introuvable."
            : "Impossible de charger cette demande de stage."}
        </Alert>
      )}

      {stage && (
        <>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="h5" component="h1">
              Demande de stage
            </Typography>
            <StageStatusChip status={stage.status} />
            {stage.status === "DRAFT" && (
              <Button
                component={Link}
                to={stageEditPath(stage.id)}
                size="small"
                startIcon={<EditOutlinedIcon />}
                sx={{ ml: "auto" }}
              >
                Modifier
              </Button>
            )}
          </Stack>

          {stage.status === "REFUSED" && stage.refusalReason && (
            <Alert severity="error" variant="filled">
              <AlertTitle>Demande refusée</AlertTitle>
              {stage.refusalReason}
            </Alert>
          )}

          <RecapSection title="Organisme & tuteur">
            <RecapField label="Organisme">
              {stage.organism.name}
              <SecondaryLine>{formatOrganismAddress(stage.organism)}</SecondaryLine>
            </RecapField>
            <RecapField label="Tuteur">
              {`${stage.tutor.firstName} ${stage.tutor.lastName} (${stage.tutor.jobTitle})`}
              <SecondaryLine>{formatTutorContact(stage.tutor)}</SecondaryLine>
            </RecapField>
          </RecapSection>

          <RecapSection title="Périodes">
            {stage.periods.map((period, index) => (
              <RecapField key={period.id} label={`Période ${index + 1}`}>
                {formatPeriodRange(period)}
              </RecapField>
            ))}
          </RecapSection>

          <RecapSection title="Détails">
            <RecapField label="Année scolaire">{stage.schoolYear}</RecapField>
            <RecapField label="Semestre">{SEMESTER_LABELS[stage.semester]}</RecapField>
            <RecapField label="Type de stage">{formatStageKind(stage.mandatory)}</RecapField>
            {stage.submittedAt && (
              <RecapField label="Date de soumission">{formatDate(stage.submittedAt)}</RecapField>
            )}
            <RecapField label="Service">{stage.service?.trim() || "Non renseigné"}</RecapField>
            <RecapField label="Type de handicap concerné">
              {stage.projectType?.trim() || "Non renseigné"}
            </RecapField>
            <RecapField label="Motivation">
              {stage.motivation?.trim() || "Non renseignée"}
            </RecapField>
          </RecapSection>

          <RecapSection title="Référent">
            <RecapField label="Référent">{referentLabel(stage)}</RecapField>
          </RecapSection>

          {stage.status === "DRAFT" && <SubmitStageSection stage={stage} />}
        </>
      )}
    </Stack>
  );
}
