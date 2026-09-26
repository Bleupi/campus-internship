import { stagePeriodsSchema } from "shared";
import type { RawPeriod } from "./PeriodsStep";

// BR-04c/BR-05a-c: reuses the exact same schema the server enforces, so the
// wizard never gates "Suivant" on a hand-rolled parallel rule that could
// drift from it (CLAUDE.md §6 Forms).
export function validatePeriods(periods: RawPeriod[]) {
  return stagePeriodsSchema.safeParse(
    periods.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
  );
}
