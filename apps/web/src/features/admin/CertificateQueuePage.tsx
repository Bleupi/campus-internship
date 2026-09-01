import { useState } from "react";
import { Alert, Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { useCertificateQueue } from "./useCertificateQueue";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

// Issue #42: queue-list slice of #41 (admin certificate-validation queue).
// Split-pane, desktop only — right pane is student info only in this slice;
// certificate rendering and Valider/Refuser land in ticket 2 (#41's next
// slice). Backend already sorts oldest-waiting-first, so the list here is
// rendered in the order it arrives.
export function CertificateQueuePage() {
  const { data: entries, isLoading, isError } = useCertificateQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  if (isError || !entries) {
    return (
      <Alert severity="error" sx={{ mt: 4 }}>
        Impossible de charger la file d'attente.
      </Alert>
    );
  }

  const selected = entries.find((entry) => entry.studentId === selectedId) ?? null;

  return (
    <Box sx={{ display: "flex", gap: 3 }}>
      <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: "divider" }}>
        <Typography variant="h4" component="h1" sx={{ px: 2, pb: 1 }}>
          Certificats à valider
        </Typography>
        {entries.length === 0 ? (
          <Typography sx={{ px: 2, color: "text.secondary" }}>
            Aucun certificat en attente de validation.
          </Typography>
        ) : (
          <List>
            {entries.map((entry) => (
              <ListItemButton
                key={entry.studentId}
                selected={entry.studentId === selectedId}
                onClick={() => setSelectedId(entry.studentId)}
              >
                <ListItemText
                  primary={`${entry.firstName} ${entry.lastName}`}
                  secondary={`${entry.promotion ?? "—"} · soumis le ${formatDate(entry.waitingSince)}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, pt: 1 }}>
        {selected ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="h6" component="h2">
              {selected.firstName} {selected.lastName}
            </Typography>
            <Typography>Promotion : {selected.promotion ?? "—"}</Typography>
            <Typography>
              En attente de validation depuis le {formatDate(selected.waitingSince)}
            </Typography>
            <Typography>
              Certificat :{" "}
              {selected.certificate
                ? `envoyé le ${formatDate(selected.certificate.uploadedAt)} (${selected.certificate.mimeType})`
                : "aucun certificat valide actuellement"}
            </Typography>
          </Box>
        ) : (
          <Typography sx={{ color: "text.secondary" }}>
            Sélectionnez un étudiant dans la liste pour voir son dossier.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
