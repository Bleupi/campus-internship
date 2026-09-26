import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { createReferentSchema, type CreateReferentRequest, type ReferentListItem } from "shared";
import { ApiError } from "../../../../lib/api-client";
import { useCreateReferent } from "./useCreateReferent";

// Issue #150 (ADR-0031): the picker's "add a referent" escape hatch, for the
// rentrée case where the needed referent does not exist yet. Only creates the
// referent — assigning it to the request is left to the caller, so it goes
// through the exact same single-assignment path as a pick from the list.
// Mounted only while open, so every opening starts from an empty form.
export function AddReferentDialog({
  assignmentHint,
  onClose,
  onCreated,
}: {
  assignmentHint: string;
  onClose: () => void;
  onCreated: (referent: ReferentListItem) => void;
}) {
  const createReferent = useCreateReferent();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateReferentRequest>({
    resolver: zodResolver(createReferentSchema),
    defaultValues: { firstName: "", lastName: "", email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      onCreated(await createReferent.mutateAsync(values));
      onClose();
    } catch (error) {
      // ADR-0031: an existing email under another name is refused (409).
      setServerError(
        error instanceof ApiError && error.status === 409
          ? "Cette adresse email appartient déjà à une personne d'un autre nom."
          : "Impossible d'ajouter le référent, merci de réessayer.",
      );
    }
  });

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>Ajouter un référent</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {assignmentHint}
            </Typography>
            {serverError && <Alert severity="error">{serverError}</Alert>}
            <TextField
              label="Prénom"
              autoFocus
              fullWidth
              {...register("firstName")}
              error={!!errors.firstName}
              helperText={errors.firstName?.message}
            />
            <TextField
              label="Nom"
              fullWidth
              {...register("lastName")}
              error={!!errors.lastName}
              helperText={errors.lastName?.message}
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              {...register("email")}
              error={!!errors.email}
              helperText={errors.email?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            Ajouter
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
