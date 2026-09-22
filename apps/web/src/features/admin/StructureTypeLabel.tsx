import { Chip } from "@mui/material";
import { useStructureTypes } from "../organisms/useStructureTypes";

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

// Only for a type that is no longer configured: HostOrganism.structureType is
// a plain string, so an old organism can still carry a removed label.
function hashIndex(label: string): number {
  let hash = 0;
  for (const char of label) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % PALETTE.length;
}

// Same type, same colour. The colour is the type's position in the configured
// list (alphabetical, as the API returns it), so up to PALETTE.length types
// never share one. Nothing is stored per type; adding a type can shift the
// colours of the ones after it (see ROADMAP_V2.md).
export function StructureTypeLabel({ structureType }: { structureType: string }) {
  const { data: structureTypes, isPending } = useStructureTypes();

  // Neutral until the list is known, so the chip does not flash a fallback colour.
  if (isPending) {
    return <Chip data-testid="structure-type-label" label={structureType} size="small" />;
  }

  const position = structureTypes?.findIndex((type) => type.label === structureType) ?? -1;
  const { bg, fg } = PALETTE[position >= 0 ? position % PALETTE.length : hashIndex(structureType)]!;
  return (
    <Chip
      data-testid="structure-type-label"
      label={structureType}
      size="small"
      sx={{ bgcolor: bg, color: fg, fontWeight: 600 }}
    />
  );
}
