// PROTOTYPE — floating switcher for the design-system comparison
// (issue #5). Not part of the shipped app; dropped once a variant wins.
import { useEffect, type CSSProperties } from "react";

export const VARIANTS = [
  { key: "mui", label: "MUI (Material Design)" },
  { key: "shadcn", label: "shadcn/ui + Radix" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export const SCREENS = [
  { key: "login", label: "Connexion" },
  { key: "submit", label: "Soumission de stage" },
  { key: "dashboard", label: "Dashboard" },
] as const;
export type ScreenKey = (typeof SCREENS)[number]["key"];

interface Props {
  variant: VariantKey;
  onVariantChange: (v: VariantKey) => void;
  screen: ScreenKey;
  onScreenChange: (s: ScreenKey) => void;
}

export function PrototypeSwitcher({ variant, onVariantChange, screen, onScreenChange }: Props) {
  const variantIndex = VARIANTS.findIndex((v) => v.key === variant);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isEditable) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    function cycle(delta: 1 | -1) {
      const next = (variantIndex + delta + VARIANTS.length) % VARIANTS.length;
      onVariantChange(VARIANTS[next]!.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variantIndex, onVariantChange]);

  if (import.meta.env.PROD) return null;

  return (
    <div
      role="toolbar"
      aria-label="Sélecteur de prototype design system"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 999,
        background: "#111827",
        color: "#f9fafb",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", gap: 4 }}>
        {SCREENS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onScreenChange(s.key)}
            aria-pressed={screen === s.key}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              background: screen === s.key ? "#f9fafb" : "transparent",
              color: screen === s.key ? "#111827" : "#f9fafb",
              fontWeight: screen === s.key ? 600 : 400,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <span aria-hidden style={{ opacity: 0.4 }}>
        |
      </span>

      <button
        type="button"
        aria-label="Variante précédente"
        onClick={() =>
          onVariantChange(VARIANTS[(variantIndex - 1 + VARIANTS.length) % VARIANTS.length]!.key)
        }
        style={arrowStyle}
      >
        ←
      </button>
      <span style={{ minWidth: 170, textAlign: "center" }}>
        {variant.toUpperCase()} — {VARIANTS[variantIndex]!.label}
      </span>
      <button
        type="button"
        aria-label="Variante suivante"
        onClick={() => onVariantChange(VARIANTS[(variantIndex + 1) % VARIANTS.length]!.key)}
        style={arrowStyle}
      >
        →
      </button>
    </div>
  );
}

const arrowStyle: CSSProperties = {
  border: "1px solid #374151",
  background: "transparent",
  color: "#f9fafb",
  borderRadius: 999,
  width: 28,
  height: 28,
  cursor: "pointer",
};
