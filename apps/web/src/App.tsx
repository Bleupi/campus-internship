import { Navigate, Route, Routes, Outlet, useLocation } from "react-router-dom";
import { Typography } from "@mui/material";
import { blocksNavigation } from "shared";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { useCurrentUser } from "./features/auth/useCurrentUser";
import { useProfile } from "./features/students/useProfile";
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

// Not a real feature — just an unblocking placeholder until the real
// dashboard screen (issue #11) exists.
function DashboardPage() {
  return <Typography sx={{ mt: 8, textAlign: "center" }}>Tableau de bord (à venir)</Typography>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireCompleteProfile />}>
          <Route element={<AppShell />}>
            <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
            <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
