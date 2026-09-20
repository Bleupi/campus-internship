// PROTOTYPE — read-only view of *everything* the student provided for a
// request (identity, organism with full address, service, project,
// motivation, tutor incl. phone consent, periods, previous mandatory stages).
// Missing values are flagged so the admin spots what to refuse for.
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { StructureTypeChip } from "./StructureTypeChip";
import {
  fmtDate,
  fmtPeriods,
  isAddressIncomplete,
  kindLabel,
  totalWeeks,
  type MockStageRequest,
} from "./mock-data";

function Field({
  label,
  children,
  missing,
}: {
  label: string;
  children?: React.ReactNode;
  missing?: boolean;
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
        {label}
      </Typography>
      {missing || children === null || children === undefined || children === "" ? (
        <Typography variant="body1" color="warning.main" sx={{ fontStyle: "italic" }}>
          Non renseigné
        </Typography>
      ) : (
        <Typography variant="body1" component="div">
          {children}
        </Typography>
      )}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

export function StageInfo({ r, columns = 1 }: { r: MockStageRequest; columns?: 1 | 2 | 3 }) {
  const { organism: o, tutor: t } = r;
  return (
    <Box
      sx={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 3 }}
    >
      {r.correctsRefused && (
        <Alert severity="info" sx={{ gridColumn: "1 / -1", whiteSpace: "pre-line" }}>
          Corrige la demande refusée du {fmtDate(r.correctsRefused.date)} — motif :{"\n"}
          {r.correctsRefused.reason}
        </Alert>
      )}
      <Stack spacing={2}>
        <Section title="Étudiant">
          <Field label="Nom">
            {r.student.firstName} {r.student.lastName} ({r.student.promotion})
          </Field>
          <Field label="Email">{r.student.email}</Field>
          <Field label="Demande">
            {kindLabel(r.mandatory)} · {r.schoolYear} · {r.semester} (déduit des périodes) · soumise
            le {fmtDate(r.submittedAt)}
          </Field>
        </Section>
        <Section title="Stages obligatoires précédents">
          {r.previousMandatory.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              Aucun.
            </Typography>
          ) : (
            r.previousMandatory.map((p) => (
              <Box key={p.schoolYear + p.semester + p.organism}>
                <Typography variant="body1">
                  <Chip size="small" label={`${p.promotion} · ${p.semester}`} sx={{ mr: 0.75 }} />
                  {p.organism}
                  {p.service ? ` — ${p.service}` : ""}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.25 }}>
                  <StructureTypeChip type={p.structureType} />
                  <Typography variant="body2" color="text.secondary">
                    {p.schoolYear}
                  </Typography>
                </Stack>
              </Box>
            ))
          )}
        </Section>
      </Stack>

      <Stack spacing={2}>
        <Section title="Organisme d'accueil">
          <Field label="Nom">{o.name}</Field>
          <Field label="Type de structure">
            <StructureTypeChip type={o.structureType} />
          </Field>
          <Field label="Adresse" missing={isAddressIncomplete(o)}>
            {!isAddressIncomplete(o) && (
              <>
                {o.street}
                <br />
                {o.postalCode} {o.city}
              </>
            )}
          </Field>
          {isAddressIncomplete(o) && (
            <Typography variant="body2" color="warning.main">
              Adresse incomplète — saisi : «{" "}
              {[o.street, o.postalCode, o.city].filter(Boolean).join(", ")} »
            </Typography>
          )}
          <Field label="Service">{r.service}</Field>
        </Section>
        <Section title="Tuteur">
          <Field label="Nom">
            {t.firstName} {t.lastName}
          </Field>
          <Field label="Fonction">{t.jobTitle}</Field>
          <Field label="Email">{t.email}</Field>
          <Field label="Téléphone">
            {t.phone
              ? `${t.phone} — ${t.acceptsPhoneContact ? "accepte d'être contacté par téléphone" : "ne souhaite pas être contacté par téléphone"}`
              : null}
          </Field>
        </Section>
      </Stack>

      <Stack spacing={2}>
        <Section title="Projet">
          <Field label="Type de projet">{r.projectType}</Field>
          <Field label="Motivation">
            <Box sx={{ whiteSpace: "pre-line" }}>{r.motivation}</Box>
          </Field>
        </Section>
        <Section title={`Périodes (${totalWeeks(r)} sem. au total)`}>
          {fmtPeriods(r).map((p) => (
            <Typography key={p} variant="body1">
              {p}
            </Typography>
          ))}
        </Section>
      </Stack>
    </Box>
  );
}
