import { useQuery } from "@tanstack/react-query";
import { getProfile } from "./api";
import { STUDENT_PROFILE_QUERY_KEY } from "./query-keys";

export function useProfile() {
  return useQuery({
    queryKey: STUDENT_PROFILE_QUERY_KEY,
    queryFn: getProfile,
  });
}
