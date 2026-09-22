export const CERTIFICATE_QUEUE_QUERY_KEY = ["admin", "students", "certificate-queue"] as const;

export const certificateQueryKey = (studentId: string) =>
  ["admin", "students", studentId, "profile", "certificate"] as const;

export const STAGE_REQUESTS_QUERY_KEY = ["admin", "stage-requests"] as const;

export const stageRequestDetailQueryKey = (id: string) => ["admin", "stage-requests", id] as const;

export const REFERENTS_QUERY_KEY = ["referents"] as const;
