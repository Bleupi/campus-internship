import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import type { ReactNode } from "react";
import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { useLogout } from "../features/auth/useLogout";
import { ROUTES } from "../routes";

const navItems = [
  { to: ROUTES.DASHBOARD, label: "Tableau de bord", icon: <SpaceDashboardOutlinedIcon /> },
  { to: ROUTES.PROFILE, label: "Profil", icon: <PersonOutlineOutlinedIcon /> },
];

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  // useMatch is the same matching react-router uses internally for NavLink's
  // own active state (aria-current) — deriving the visual style from it too
  // keeps a single source of truth instead of a parallel pathname comparison.
  const isActive = useMatch({ path: to, end: true }) !== null;

  return (
    <Button
      component={NavLink}
      to={to}
      end
      startIcon={icon}
      sx={{
        color: "inherit",
        opacity: isActive ? 1 : 0.75,
        fontWeight: isActive ? 700 : 400,
        borderBottom: "2px solid",
        borderColor: isActive ? "currentColor" : "transparent",
        borderRadius: 0,
      }}
    >
      {label}
    </Button>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Gestion des stages
          </Typography>
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
            disabled={logout.isPending}
          >
            Déconnexion
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: 3 }}>
        <Outlet />
      </Box>
    </>
  );
}
