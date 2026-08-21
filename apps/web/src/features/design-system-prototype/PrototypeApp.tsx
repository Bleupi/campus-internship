// PROTOTYPE — design-system comparison for issue #5 (wayfinder map #4).
// Question: which component library AND which visual style, locked together
// as one decision. Compares MUI (Material Design) vs shadcn/ui + Radix on
// three real student-facing screens: login, stage submission, dashboard.
// Throwaway: captured on a branch, not folded into main as-is (see
// docs/agents/spec-pipeline.md and the `prototype` skill).
import { ScopedCssBaseline, ThemeProvider } from "@mui/material";
import { DashboardScreen as MuiDashboard } from "./mui/DashboardScreen";
import { LoginScreen as MuiLogin } from "./mui/LoginScreen";
import { SubmitStageScreen as MuiSubmit } from "./mui/SubmitStageScreen";
import { theme as muiTheme } from "./mui/theme";
import { PrototypeSwitcher, type ScreenKey, type VariantKey } from "./PrototypeSwitcher";
import { DashboardScreen as ShadcnDashboard } from "./shadcn/DashboardScreen";
import { LoginScreen as ShadcnLogin } from "./shadcn/LoginScreen";
import { SubmitStageScreen as ShadcnSubmit } from "./shadcn/SubmitStageScreen";
import { useSearchParam } from "./use-search-param";

const screens: Record<VariantKey, Record<ScreenKey, () => JSX.Element>> = {
  mui: { login: MuiLogin, submit: MuiSubmit, dashboard: MuiDashboard },
  shadcn: { login: ShadcnLogin, submit: ShadcnSubmit, dashboard: ShadcnDashboard },
};

export function PrototypeApp() {
  const [variant, setVariant] = useSearchParam("variant", "mui");
  const [screen, setScreen] = useSearchParam("screen", "login");

  const variantKey = (variant as VariantKey) in screens ? (variant as VariantKey) : "mui";
  const screenKey = (screen as ScreenKey) in screens[variantKey] ? (screen as ScreenKey) : "login";
  const Screen = screens[variantKey][screenKey];

  const content =
    variantKey === "mui" ? (
      <ThemeProvider theme={muiTheme}>
        <ScopedCssBaseline>
          <Screen />
        </ScopedCssBaseline>
      </ThemeProvider>
    ) : (
      <Screen />
    );

  return (
    <>
      {content}
      <PrototypeSwitcher
        variant={variantKey}
        onVariantChange={setVariant}
        screen={screenKey}
        onScreenChange={setScreen}
      />
    </>
  );
}
