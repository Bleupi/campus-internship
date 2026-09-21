export const CERTIFICATE_QUEUE_QUERY_KEY = ["admin", "students", "certificate-queue"] as const;

export const certificateQueryKey = (studentId: string) =>
  ["admin", "students", studentId, "profile", "certificate"] as const;

export const STAGE_REQUESTS_QUERY_KEY = ["admin", "stage-requests"] as const;
