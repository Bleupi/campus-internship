import { z } from "zod";

// BR-01: a school year "YYYY-YYYY" spans the half-open interval
// [YYYY-09-01T00:00, (YYYY+1)-09-01T00:00). Format + N+1 rule are the only
// two layers of validation (ADR-0012) — no rollover/comparison logic here,
// that's #12/BR-06's job.
export const schoolYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "Le format attendu est AAAA-AAAA")
  .refine(
    (value) => {
      const parts = value.split("-").map(Number);
      return parts[1] === parts[0]! + 1;
    },
    { message: "La deuxième année doit être la première année + 1" },
  );

// UTC-based so this is deterministic regardless of the host machine's local
// timezone (BR-01's September 1 boundary).
export function getCurrentSchoolYear(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const isBeforeSeptember = date.getUTCMonth() < 8; // 0-indexed: 8 = September
  const startYear = isBeforeSeptember ? year - 1 : year;
  return `${startYear}-${startYear + 1}`;
}
