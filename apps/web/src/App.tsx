import { Navigate, Route, Routes, Outlet, useLocation } from "react-router-dom";
import { Typography } from "@mui/material";
import { blocksNavigation } from "shared";
import { AppShell } from "./components/AppShell";
import { CertificateQueuePage } from "./features/admin/CertificateQueuePage";
import { StageRequestsPage } from "./features/admin/StageRequestsPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { SignupPage } from "./features/auth/SignupPage";
import { useCurrentUser } from "./features/auth/useCurrentUser";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { EditStagePage } from "./features/stages/EditStagePage";
import { NewStagePage } from "./features/stages/NewStagePage";
import { StageDetailPage } from "./features/stages/StageDetailPage";
import { StagesListPage } from "./features/stages/StagesListPage";
import { useProfile } from "./features/students/useProfile";
import { isStageManagementEnabled } from "./lib/feature-flags";
import { ROUTES } from "./routes";
import { ProfilePage } from "./features/students/ProfilePage";

function RequireAuth() {
  const { data, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// BR-06: hard-block every route except /profile (and logout, an action, not
// a route) while the student's profile is INCOMPLETE/EXPIRED — whether that
// is a fresh signup or the lazy yearly rollover applied at login. Driven by
// the live `useProfile()` query (not the one-off login response) so it
// unblocks itself as soon as the student resolves it, without a re-login.
// Fails closed on a fetch error: an unconfirmed profile is treated as
// blocked rather than letting a possibly-blocked student through.
function RequireCompleteProfile() {
  const { data: me } = useCurrentUser();
  const location = useLocation();
  const isStudent = me?.user.roles.includes("STUDENT") ?? false;
  const { data: profile, isLoading, isError } = useProfile({ enabled: isStudent });

  if (!isStudent) {
    return <Outlet />;
  }
  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  const blocked = isError || (!!profile && blocksNavigation(profile.profileStatus));
  if (blocked && location.pathname !== ROUTES.PROFILE) {
    return <Navigate to={ROUTES.PROFILE} replace />;
  }
  return <Outlet />;
}

// Issue #42: defense-in-depth only — the backend already 403s a non-ADMIN
// caller of the queue endpoint itself; this just avoids rendering the page
// (and firing its query) for a role that could never see data from it.
function RequireAdmin() {
  const { data } = useCurrentUser();
  const isAdmin = data?.user.roles.includes("ADMIN") ?? false;
  if (!isAdmin) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }
  return <Outlet />;
}

// Issue #114: a student's default page is their request list, not the
// dashboard placeholder. Sits inside RequireCompleteProfile, so a student whose
// profile is incomplete/refused/expired is still sent to /profile first (BR-06).
function HomeRoute() {
  const { data: me } = useCurrentUser();
  const isStudent = me?.user.roles.includes("STUDENT") ?? false;
  if (isStageManagementEnabled && isStudent) {
    return <Navigate to={ROUTES.STAGES} replace />;
  }
  return <DashboardPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireCompleteProfile />}>
          <Route element={<AppShell />}>
            <Route path={ROUTES.DASHBOARD} element={<HomeRoute />} />
            <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
            {isStageManagementEnabled && (
              <>
                <Route path={ROUTES.STAGES} element={<StagesListPage />} />
                <Route path={ROUTES.STAGE_NEW} element={<NewStagePage />} />
                <Route path={ROUTES.STAGE_DETAIL} element={<StageDetailPage />} />
                <Route path={ROUTES.STAGE_EDIT} element={<EditStagePage />} />
              </>
            )}
            <Route element={<RequireAdmin />}>
              <Route path={ROUTES.CERTIFICATE_QUEUE} element={<CertificateQueuePage />} />
              {isStageManagementEnabled && (
                <Route path={ROUTES.STAGE_REQUESTS} element={<StageRequestsPage />} />
              )}
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
