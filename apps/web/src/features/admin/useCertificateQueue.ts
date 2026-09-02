import { useQuery } from "@tanstack/react-query";
import { getCertificateQueue } from "./api";
import { CERTIFICATE_QUEUE_QUERY_KEY } from "./query-keys";

export function useCertificateQueue() {
  return useQuery({
    queryKey: CERTIFICATE_QUEUE_QUERY_KEY,
    queryFn: getCertificateQueue,
  });
}
