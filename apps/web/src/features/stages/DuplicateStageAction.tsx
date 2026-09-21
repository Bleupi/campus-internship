import { Alert, Button, Stack } from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { useNavigate } from "react-router-dom";
import { stageDetailPath } from "../../routes";
import { describeDuplicateError } from "./duplicate-error-message";
import { useDuplicateStage } from "./useDuplicateStage";

// Offered on every status: a refused request is duplicated to be corrected and
// resubmitted, but any other one can seed a new request too. The student lands
// on the new draft, the copy they will want to work on next.
export function DuplicateStageAction({ stageId }: { stageId: string }) {
  const navigate = useNavigate();
  const duplicate = useDuplicateStage();

  return (
    <Stack spacing={1.5}>
      {duplicate.error && <Alert severity="error">{describeDuplicateError(duplicate.error)}</Alert>}
      <Button
        variant="outlined"
        startIcon={<ContentCopyOutlinedIcon />}
        disabled={duplicate.isPending}
        onClick={() =>
          duplicate.mutate(stageId, {
            onSuccess: (copy) => navigate(stageDetailPath(copy.id)),
          })
        }
        aria-label="Dupliquer la demande de stage"
        sx={{ alignSelf: { sm: "flex-start" } }}
      >
        Dupliquer
      </Button>
    </Stack>
  );
}
