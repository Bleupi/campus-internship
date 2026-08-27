import type { ReactElement } from "react";
import { Navigate, Route, Routes, useNavigate, Link as RouterLink } from "react-router-dom";
import { Button, Typography } from "@mui/material";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { useCurrentUser } from "./features/auth/useCurrentUser";
import { useLogout } from "./features/auth/useLogout";
import { ProfilePage } from "./features/students/ProfilePage";

function RequireAuth({ children }: { children: ReactElement }) {
  const { data, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Chargement…</Typography>;
  }
  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Not a real feature — just an unblocking redirect target until the real
// dashboard/profile screens (issue #11) exist.
function DashboardPage() {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <Typography sx={{ mt: 8, textAlign: "center" }}>
      Tableau de bord (à venir)
      <br />
      <Button component={RouterLink} to="/profile">
        Mon profil
      </Button>
      <Button
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
        disabled={logout.isPending}
      >
        Déconnexion
      </Button>
    </Typography>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
