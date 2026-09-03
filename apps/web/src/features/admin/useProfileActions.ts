import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client";
import { rejectProfile, validateProfile } from "./api";
import { CERTIFICATE_QUEUE_QUERY_KEY } from "./query-keys";

// Issue #43: both transitions reuse the #13 endpoints unchanged. The queue
// is refetched on a clean success AND on a 409 — a 409 means another admin
// already moved the profile out of PENDING_VALIDATION, so the row is stale
// either way and a refetch drops it. Any other error leaves the queue
// untouched (unknown state — nothing to reconcile it against). The
// "déjà traité" toast itself is the caller's concern (CertificateQueuePage),
// not this hook's.
function shouldRefetchQueue(error: unknown): boolean {
  return !error || (error instanceof ApiError && error.status === 409);
}

// Shared by useValidateProfile/useRejectProfile below — same
// success/409-triggers-a-refetch wiring for both, only mutationFn differs.
function useProfileTransition<TVariables>(
  mutationFn: (variables: TVariables) => ReturnType<typeof validateProfile>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: (_data, error) => {
      if (shouldRefetchQueue(error)) {
        queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUEUE_QUERY_KEY });
      }
    },
  });
}

export function useValidateProfile() {
  return useProfileTransition((studentId: string) => validateProfile(studentId));
}

export function useRejectProfile() {
  return useProfileTransition(({ studentId, reason }: { studentId: string; reason: string }) =>
    rejectProfile(studentId, reason),
  );
}
