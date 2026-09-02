import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCertificate } from "./api";
import { certificateQueryKey } from "./query-keys";

// Issue #43: fetches the certificate Blob through the authenticated
// api-client (ADR-0024) and turns it into an object URL for inline
// rendering — never a raw <embed src="..."> pointed at the API route
// directly, which would bypass api-client's 401-retry-once refresh. The
// object URL is revoked on every Blob change/unmount so navigating between
// students doesn't leak one per selection.
export function useStudentCertificate(studentId: string | null) {
  const query = useQuery({
    queryKey: certificateQueryKey(studentId ?? "none"),
    queryFn: () => getCertificate(studentId as string),
    enabled: studentId !== null,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(query.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [query.data]);

  return { objectUrl, isLoading: query.isLoading, isError: query.isError };
}
