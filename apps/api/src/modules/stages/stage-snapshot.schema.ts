import { z } from "zod";
import { PROMOTIONS, SEMESTERS, schoolYearSchema } from "shared";

// ADR-0033. The content frozen into `Stage.snapshot` when a stage is validated
// or refused: the stage detail's own shape (ADR-0003's single read path), minus
// what stays a live column of the row (id, status, version, submission date,
// refusal reason) and the per-row `editable` flags, which a frozen stage always
// answers `false` to; plus what only exists at decision time: who decided, when,
// and the student's promotion then. Unknown keys are dropped on parse, so a
// writer can add fields without breaking a reader that predates them.
const stageSnapshotV1Schema = z.object({
  schoolYear: schoolYearSchema,
  semester: z.enum(SEMESTERS),
  mandatory: z.boolean(),
  service: z.string().nullable(),
  projectType: z.string().nullable(),
  motivation: z.string().nullable(),
  organism: z.object({
    id: z.string(),
    name: z.string(),
    structureType: z.string(),
    city: z.string(),
    postalCode: z.string(),
    street: z.string(),
  }),
  tutor: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    jobTitle: z.string(),
    phone: z.string().nullable(),
    acceptsPhoneContact: z.boolean(),
  }),
  periods: z.array(
    z.object({
      id: z.string(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  ),
  // BR-03: a decision requires a referent, so a frozen one is never null.
  referent: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  // The student's promotion when the decision was taken, to label past stages
  // ("L2 · S1") even after they move up a year.
  promotion: z.enum(PROMOTIONS),
  // "Decided" covers both outcomes: the status says which one it was.
  decidedAt: z.string().datetime(),
  // The acting admin, frozen with the function they held: the title is a
  // hardcoded string today and will change (BR-11), a decided stage must not.
  decidedBy: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    title: z.string(),
  }),
});

export type StageSnapshot = z.infer<typeof stageSnapshotV1Schema>;

export const CURRENT_STAGE_SNAPSHOT_VERSION = 1;

// Same function serves both directions: a writer calls
// parseStageSnapshot(candidate, CURRENT_STAGE_SNAPSHOT_VERSION) so a write
// that would not read back fails at write time instead of freezing a corrupt
// document (ADR-0003: `snapshot` is untyped Json in Prisma). Dispatches on
// `snapshotVersion` so an old snapshot stays readable after the shape
// evolves: a new version adds a case, it never edits an existing one. Throws
// on a null/unknown version or a body that no longer parses; the caller must
// not fall back to the live rows (BR-08).
export function parseStageSnapshot(
  snapshot: unknown,
  snapshotVersion: number | null,
): StageSnapshot {
  switch (snapshotVersion) {
    case 1:
      return stageSnapshotV1Schema.parse(snapshot);
    default:
      throw new Error(`Unknown stage snapshot version: ${snapshotVersion}`);
  }
}
