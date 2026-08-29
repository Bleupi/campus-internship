import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLogout } from "../features/auth/useLogout";

const navItems = [
  { to: "/dashboard", label: "Tableau de bord", icon: <SpaceDashboardOutlinedIcon /> },
  { to: "/profile", label: "Profil", icon: <PersonOutlineIcon /> },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Gestion des stages
          </Typography>
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end
                startIcon={item.icon}
                sx={{
                  color: "inherit",
                  opacity: isActive ? 1 : 0.75,
                  fontWeight: isActive ? 700 : 400,
                  borderBottom: "2px solid",
                  borderColor: isActive ? "currentColor" : "transparent",
                  borderRadius: 0,
                }}
              >
                {item.label}
              </Button>
            );
          })}
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
