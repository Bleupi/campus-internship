import { z } from "zod";
import type { Semester } from "../enums";
import {
  getCurrentSchoolYear,
  getSchoolYearEnd,
  getSchoolYearStart,
  getSemesterBoundary,
} from "./school-year.schema";

// ADR-0008: StagePeriod is the source of truth for a stage's dates —
// startDate/endDate only, no semester/schoolYear on the period itself (those
// are derived for the whole stage from the full set of periods, BR-04b).
export const stagePeriodInputSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((period) => period.endDate >= period.startDate, {
    message: "La date de fin doit être postérieure ou égale à la date de début",
    path: ["endDate"],
  });

export type StagePeriodInput = z.infer<typeof stagePeriodInputSchema>;

function overlaps(a: StagePeriodInput, b: StagePeriodInput): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

// BR-04c/BR-05c: at least one period; endDate >= startDate (per-period,
// above); no overlap; every period within the same school year, which — via
// the half-open bound (ADR-0009) — is exactly the same check as "no period
// ends on/after next September 1st 00:00".
export const stagePeriodsSchema = z
  .array(stagePeriodInputSchema)
  .min(1, "Au moins une période est requise")
  .superRefine((periods, ctx) => {
    // .min(1) above already reports the empty-array case; it marks the
    // result "dirty" rather than aborting, so this refinement still runs
    // and would otherwise crash on periods[0].
    if (periods.length === 0) return;

    const schoolYear = getCurrentSchoolYear(periods[0]!.startDate);
    const schoolYearStart = getSchoolYearStart(schoolYear);
    const schoolYearEnd = getSchoolYearEnd(schoolYear);

    periods.forEach((period, index) => {
      if (period.startDate < schoolYearStart || period.endDate > schoolYearEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La période doit rester dans l'année scolaire ${schoolYear}`,
          path: [index],
        });
      }
      if (period.endDate.getTime() === schoolYearEnd.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "La période ne peut pas se terminer au 1er septembre de l'année suivante (borne exclue)",
          path: [index, "endDate"],
        });
      }
    });

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        if (overlaps(periods[i]!, periods[j]!)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Les périodes ne doivent pas se chevaucher",
            path: [j],
          });
        }
      }
    }
  });

export type StagePeriods = z.infer<typeof stagePeriodsSchema>;

// BR-04b: semester is derived, never entered — this is the only place that
// decides it. All periods in S1 -> S1; all in S2 -> S2; straddling -> S1
// wins. `periods` is assumed already-validated by stagePeriodsSchema (same
// school year for every period), so a single boundary is enough to classify
// all of them.
export function deriveSemester(periods: StagePeriods): Semester {
  const boundary = getSemesterBoundary(getCurrentSchoolYear(periods[0]!.startDate));

  let hasS1 = false;
  let hasS2 = false;
  for (const period of periods) {
    if (period.startDate < boundary) hasS1 = true;
    if (period.endDate > boundary) hasS2 = true;
  }

  if (hasS1 && hasS2) return "S1";
  return hasS2 ? "S2" : "S1";
}
