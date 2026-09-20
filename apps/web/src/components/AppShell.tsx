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
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/MenuOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../features/auth/useCurrentUser";
import { useLogout } from "../features/auth/useLogout";
import { isStageManagementEnabled } from "../lib/feature-flags";
import { ROUTES } from "../routes";

interface NavItemConfig {
  to: string;
  label: string;
  icon: ReactNode;
  // Default true (exact match). false keeps the item current on sub-routes.
  end?: boolean;
}

const dashboardNavItem: NavItemConfig = {
  to: ROUTES.DASHBOARD,
  label: "Tableau de bord",
  icon: <SpaceDashboardOutlinedIcon />,
};
const profileNavItem: NavItemConfig = {
  to: ROUTES.PROFILE,
  label: "Profil",
  icon: <PersonOutlineOutlinedIcon />,
};

// Issue #114: the student's own request list takes the dashboard's place, only
// while the feature flag is on and only for a STUDENT (the endpoint behind it
// is student-only). It is the student's default page (see App.tsx HomeRoute).
// `end: false`: it stays current on the request detail page (/stages/:id) too.
const stagesNavItem: NavItemConfig = {
  to: ROUTES.STAGES,
  label: "Mes demandes",
  icon: <AssignmentOutlinedIcon />,
  end: false,
};

// Issue #42: the queue-list link only makes sense (and only avoids a 403)
// for an ADMIN — same role check as App.tsx's RequireAdmin route guard.
const adminNavItem: NavItemConfig = {
  to: ROUTES.CERTIFICATE_QUEUE,
  label: "Certificats à valider",
  icon: <FactCheckOutlinedIcon />,
};

// useMatch is the same matching react-router uses internally for NavLink's
// own active state (aria-current) — deriving the visual style from it too
// keeps a single source of truth instead of a parallel pathname comparison.
function useIsActive(to: string, end: boolean) {
  return useMatch({ path: to, end }) !== null;
}

function NavItem({
  to,
  label,
  icon,
  end = true,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}) {
  const isActive = useIsActive(to, end);

  return (
    <Button
      component={NavLink}
      to={to}
      end={end}
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
  end = true,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  onNavigate: () => void;
}) {
  const isActive = useIsActive(to, end);

  return (
    <ListItemButton
      component={NavLink}
      to={to}
      end={end}
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
  const { data: me } = useCurrentUser();
  const isAdmin = me?.user.roles.includes("ADMIN") ?? false;
  const isStudent = me?.user.roles.includes("STUDENT") ?? false;
  const navItems: NavItemConfig[] = [
    isStageManagementEnabled && isStudent ? stagesNavItem : dashboardNavItem,
    profileNavItem,
    ...(isAdmin ? [adminNavItem] : []),
  ];

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
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  end={item.end}
                />
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
                  end={item.end}
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
      <Box component="main" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        <Outlet />
      </Box>
    </>
  );
}
