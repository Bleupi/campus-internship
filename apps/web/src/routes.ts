export const ROUTES = {
  DASHBOARD: "/dashboard",
  PROFILE: "/profile",
  CERTIFICATE_QUEUE: "/admin/certificate-queue",
  STAGE_REQUESTS_PROTOTYPE: "/admin/prototype/stage-requests", // PROTOTYPE — throwaway
  STAGES: "/stages",
  STAGE_NEW: "/stages/new",
  STAGE_DETAIL: "/stages/:id",
} as const;

export const stageDetailPath = (id: string) => `${ROUTES.STAGES}/${id}`;
