import { z } from "zod";
import { SEMESTERS } from "../enums/semester.enum";
import { schoolYearSchema } from "./school-year.schema";

// Issue #148: the referent domain owns ReferentAssignment (ADR-0014), so this
// upserts on the exact same four-tuple the row is keyed on — not on a stage
// id — matching/UPDATE semantics live entirely in the service, this schema
// only shapes the request.
export const assignReferentSchema = z.object({
  studentId: z.string().uuid(),
  schoolYear: schoolYearSchema,
  semester: z.enum(SEMESTERS),
  mandatory: z.boolean(),
  referentId: z.string().uuid(),
});
