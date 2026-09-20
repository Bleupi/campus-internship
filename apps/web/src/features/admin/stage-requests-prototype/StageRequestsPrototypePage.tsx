// PROTOTYPE — admin "stage requests to process" page (table + bulk actions).
// Add `?referents=none` to start with no referent at all (fresh school year).
// All data is stubbed in memory; nothing here talks to the API.
import { Snackbar } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useMockStageRequests } from "./useMockStageRequests";
import { VariantB } from "./VariantB";

export function StageRequestsPrototypePage() {
  const [params] = useSearchParams();
  const store = useMockStageRequests(params.get("referents") === "none");

  return (
    <>
      <VariantB store={store} />
      <Snackbar
        open={store.toast !== null}
        autoHideDuration={4000}
        onClose={store.clearToast}
        message={store.toast}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </>
  );
}
