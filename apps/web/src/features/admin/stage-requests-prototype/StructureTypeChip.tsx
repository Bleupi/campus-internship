// PROTOTYPE — coloured label for an organism's structure type, so the admin
// can tell a company from an association or a hospital at a glance. Same type
// = same colour everywhere (current request and previous validated stages).
import { Chip } from "@mui/material";

const PALETTE = {
  association: { bg: "#E3F2E1", fg: "#1B5E20" },
  company: { bg: "#E1ECFA", fg: "#0D47A1" },
  publicHealth: { bg: "#EDE4F7", fg: "#4527A0" },
  privateHealth: { bg: "#DDF3F1", fg: "#00695C" },
  medicoSocial: { bg: "#FFEBD6", fg: "#B34700" },
  foundation: { bg: "#FBE4EE", fg: "#AD1457" },
  local: { bg: "#E4E7FA", fg: "#283593" },
  other: { bg: "#ECECEC", fg: "#424242" },
} as const;

function paletteFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("association")) return PALETTE.association;
  if (t.includes("entreprise")) return PALETTE.company;
  if (t.includes("médico-social")) return PALETTE.medicoSocial;
  if (t.includes("public")) return PALETTE.publicHealth;
  if (t.includes("santé privé")) return PALETTE.privateHealth;
  if (t.includes("fondation")) return PALETTE.foundation;
  if (t.includes("proximité")) return PALETTE.local;
  return PALETTE.other;
}

export function StructureTypeChip({ type }: { type: string }) {
  const { bg, fg } = paletteFor(type);
  return (
    <Chip
      size="small"
      label={type}
      sx={{ bgcolor: bg, color: fg, fontWeight: 600, maxWidth: "100%" }}
    />
  );
}
