import {
  Box,
  LinearProgress,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { WIZARD_STEPS } from "./wizard-steps";

export function WizardProgress({ step }: { step: number }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Four labelled steps side by side don't fit a phone's width and push the
  // whole page into horizontal scroll: show progress instead.
  if (isMobile) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Étape {step + 1} sur {WIZARD_STEPS.length} : {WIZARD_STEPS[step]}
        </Typography>
        <LinearProgress variant="determinate" value={((step + 1) / WIZARD_STEPS.length) * 100} />
      </Box>
    );
  }

  return (
    <Stepper activeStep={step} sx={{ mb: 4 }}>
      {WIZARD_STEPS.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
