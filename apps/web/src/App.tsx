import { Navigate, Route, Routes, Outlet } from "react-router-dom";
import { Typography } from "@mui/material";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { useCurrentUser } from "./features/auth/useCurrentUser";
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
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
