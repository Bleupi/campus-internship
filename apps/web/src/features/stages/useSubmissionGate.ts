import { getSubmissionBlockers, type SubmissionCandidate } from "shared";
import { useProfile } from "../students/useProfile";

// The web side of the submission gate, shared by the detail page and the
// wizard's recap: the same getSubmissionBlockers() the API enforces, fed with
// the student's profile status. Until the profile is known the gate can't be
// evaluated, so submission stays disabled without inventing a reason.
export function useSubmissionGate(draft: Omit<SubmissionCandidate, "profileStatus">) {
  const profile = useProfile();
  const blockers = profile.data
    ? getSubmissionBlockers({ ...draft, profileStatus: profile.data.profileStatus })
    : [];

  return {
    blockers,
    canSubmit: profile.data !== undefined && blockers.length === 0,
    profileFailed: profile.isError,
  };
}
