import { FormControlLabel, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";

interface Props {
  service: string;
  projectType: string;
  motivation: string;
  // No default: an explicit true/false choice is required (issue #113 AC).
  mandatory: boolean | null;
  onServiceChange: (value: string) => void;
  onProjectTypeChange: (value: string) => void;
  onMotivationChange: (value: string) => void;
  onMandatoryChange: (value: boolean) => void;
}

export function DetailsStep({
  service,
  projectType,
  motivation,
  mandatory,
  onServiceChange,
  onProjectTypeChange,
  onMotivationChange,
  onMandatoryChange,
}: Props) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 420 }}>
      <TextField
        label="Service"
        value={service}
        onChange={(e) => onServiceChange(e.target.value)}
      />
      <TextField
        label="Type de handicap concerné"
        value={projectType}
        onChange={(e) => onProjectTypeChange(e.target.value)}
      />
      <TextField
        label="Motivation"
        multiline
        minRows={3}
        value={motivation}
        onChange={(e) => onMotivationChange(e.target.value)}
      />
      <Typography component="legend" variant="subtitle2">
        Ce stage est-il obligatoire ?
      </Typography>
      <RadioGroup
        value={mandatory === null ? "" : String(mandatory)}
        onChange={(e) => onMandatoryChange(e.target.value === "true")}
      >
        <FormControlLabel value="true" control={<Radio />} label="Oui" />
        <FormControlLabel value="false" control={<Radio />} label="Non" />
      </RadioGroup>
    </Stack>
  );
}
