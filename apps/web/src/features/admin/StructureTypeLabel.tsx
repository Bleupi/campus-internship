import { Chip } from "@mui/material";

// Same type, same colour: the palette index comes from a hash of the label, so
// no colour is stored per type (the types are admin-configurable free text).
const PALETTE = [
  { bg: "#e3f2fd", fg: "#0d47a1" },
  { bg: "#e8f5e9", fg: "#1b5e20" },
  { bg: "#fff3e0", fg: "#e65100" },
  { bg: "#f3e5f5", fg: "#4a148c" },
  { bg: "#e0f2f1", fg: "#004d40" },
  { bg: "#fce4ec", fg: "#880e4f" },
  { bg: "#fffde7", fg: "#827717" },
  { bg: "#ede7f6", fg: "#311b92" },
] as const;

function paletteIndex(label: string): number {
  let hash = 0;
  for (const char of label) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % PALETTE.length;
}

export function StructureTypeLabel({ structureType }: { structureType: string }) {
  const { bg, fg } = PALETTE[paletteIndex(structureType)]!;
  return (
    <Chip
      data-testid="structure-type-label"
      label={structureType}
      size="small"
      sx={{ bgcolor: bg, color: fg, fontWeight: 600 }}
    />
  );
}
