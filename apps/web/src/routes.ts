export const ROUTES = {
  DASHBOARD: "/dashboard",
  PROFILE: "/profile",
  CERTIFICATE_QUEUE: "/admin/certificate-queue",
  STAGES: "/stages",
  STAGE_NEW: "/stages/new",
  STAGE_DETAIL: "/stages/:id",
  STAGE_EDIT: "/stages/:id/edit",
} as const;

export const stageDetailPath = (id: string) => `${ROUTES.STAGES}/${id}`;
export const stageEditPath = (id: string) => `${ROUTES.STAGES}/${id}/edit`;
