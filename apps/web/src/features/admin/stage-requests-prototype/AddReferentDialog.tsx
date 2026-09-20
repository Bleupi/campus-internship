// PROTOTYPE — "add a referent on the fly" dialog, reused by all variants
// (the dialog isn't what's being compared; where it's *triggered* from is).
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { NewReferentInput } from "./useMockStageRequests";

export function AddReferentDialog({
  open,
  onClose,
  onCreate,
  context,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewReferentInput) => void;
  context?: string;
}) {
  const [form, setForm] = useState<NewReferentInput>({ firstName: "", lastName: "", email: "" });
  const valid = form.firstName.trim() && form.lastName.trim() && /\S+@\S+\.\S+/.test(form.email);
  const set = (key: keyof NewReferentInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function submit() {
    if (!valid) return;
    onCreate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
    });
    setForm({ firstName: "", lastName: "", email: "" });
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Ajouter un référent</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {context && (
            <Typography variant="body2" color="text.secondary">
              {context}
            </Typography>
          )}
          <TextField
            label="Prénom"
            value={form.firstName}
            onChange={set("firstName")}
            autoFocus
            fullWidth
          />
          <TextField label="Nom" value={form.lastName} onChange={set("lastName")} fullWidth />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={set("email")}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={submit} disabled={!valid}>
          Ajouter
        </Button>
      </DialogActions>
    </Dialog>
  );
}
