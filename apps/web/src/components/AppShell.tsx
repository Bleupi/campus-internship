import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/MenuOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { useLogout } from "../features/auth/useLogout";
import { ROUTES } from "../routes";

const navItems = [
  { to: ROUTES.DASHBOARD, label: "Tableau de bord", icon: <SpaceDashboardOutlinedIcon /> },
  { to: ROUTES.PROFILE, label: "Profil", icon: <PersonOutlineOutlinedIcon /> },
];

// useMatch is the same matching react-router uses internally for NavLink's
// own active state (aria-current) — deriving the visual style from it too
// keeps a single source of truth instead of a parallel pathname comparison.
function useIsActive(to: string) {
  return useMatch({ path: to, end: true }) !== null;
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const isActive = useIsActive(to);

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

function DrawerNavItem({
  to,
  label,
  icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  onNavigate: () => void;
}) {
  const isActive = useIsActive(to);

  return (
    <ListItemButton
      component={NavLink}
      to={to}
      end
      onClick={onNavigate}
      sx={{
        color: isActive ? "primary.main" : "text.secondary",
        fontWeight: isActive ? 700 : 400,
        borderLeft: "3px solid",
        borderColor: isActive ? "secondary.main" : "transparent",
      }}
    >
      <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>{icon}</ListItemIcon>
      <ListItemText primary={label} />
    </ListItemButton>
  );
}

export function AppShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const logout = useLogout();

  const handleLogout = () => {
    setDrawerOpen(false);
    logout.mutate(undefined, { onSuccess: () => navigate("/login") });
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              aria-label="Ouvrir le menu"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Gestion des stages
          </Typography>
          {!isMobile && (
            <>
              {navItems.map((item) => (
                <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
              ))}
              <Button
                color="inherit"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                Déconnexion
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      {isMobile && (
        <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Box
            role="presentation"
            sx={{ width: 260, height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Typography variant="subtitle2" sx={{ px: 2, py: 1.5 }}>
              Gestion des stages
            </Typography>
            <Divider />
            <List sx={{ flexGrow: 1 }}>
              {navItems.map((item) => (
                <DrawerNavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </List>
            <Divider />
            <List>
              <ListItemButton onClick={handleLogout} disabled={logout.isPending}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <LogoutIcon />
                </ListItemIcon>
                <ListItemText primary="Déconnexion" />
              </ListItemButton>
            </List>
          </Box>
        </Drawer>
      )}
      <Box component="main" sx={{ p: 3 }}>
        <Outlet />
      </Box>
    </>
  );
}
