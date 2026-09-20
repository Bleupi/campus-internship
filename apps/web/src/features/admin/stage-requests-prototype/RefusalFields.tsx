// PROTOTYPE — refusal reasons form shared by B and C (content is not what's
// being compared; where it opens from is).
import { Checkbox, FormControlLabel, Stack, TextField } from "@mui/material";
import { REFUSAL_REASONS, type RefusalDraft } from "./refusal";

export function RefusalFields({
  draft,
  onChange,
}: {
  draft: RefusalDraft;
  onChange: (d: RefusalDraft) => void;
}) {
  const toggle = (id: string) =>
    onChange({
      ...draft,
      checked: draft.checked.includes(id)
        ? draft.checked.filter((x) => x !== id)
        : [...draft.checked, id],
    });
  return (
    <Stack>
      {REFUSAL_REASONS.map((reason) => (
        <Stack key={reason.id}>
          <FormControlLabel
            label={reason.label}
            control={
              <Checkbox
                checked={draft.checked.includes(reason.id)}
                onChange={() => toggle(reason.id)}
              />
            }
          />
          {"needsDetail" in reason && draft.checked.includes(reason.id) && (
            <TextField
              size="small"
              autoFocus
              required
              multiline
              label="Informations manquantes"
              placeholder="ex. : numéro de téléphone du tuteur, service d'accueil…"
              value={draft.missingDetail}
              onChange={(e) => onChange({ ...draft, missingDetail: e.target.value })}
              sx={{ ml: 4, mb: 1 }}
            />
          )}
        </Stack>
      ))}
      <TextField
        size="small"
        multiline
        label="Autre précision (facultatif)"
        value={draft.freeText}
        onChange={(e) => onChange({ ...draft, freeText: e.target.value })}
        sx={{ mt: 1 }}
      />
    </Stack>
  );
}
