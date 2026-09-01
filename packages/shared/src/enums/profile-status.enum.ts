export const PROFILE_STATUSES = ["INCOMPLETE", "PENDING_VALIDATION", "VALID", "EXPIRED"] as const;

export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

// BR-06: a student in either of these statuses (fresh signup, or the lazy
// yearly rollover) must complete/renew their profile before anything else —
// the single source of truth for the frontend's route guard, post-login
// redirect, and forced-edit-mode UI (apps/web/src/App.tsx, LoginPage.tsx,
// ProfilePage.tsx).
export function blocksNavigation(status: ProfileStatus): boolean {
  return status === "INCOMPLETE" || status === "EXPIRED";
}
