import { useQuery } from "@tanstack/react-query";
import { getMe } from "./api";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getMe,
    retry: false,
  });
}
