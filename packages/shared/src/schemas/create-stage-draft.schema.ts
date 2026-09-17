import { z } from "zod";
import { frenchMobilePhoneSchema } from "./phone.schema";
import { stagePeriodsSchema } from "./stage-period.schema";

// Inline-creation payload for a new HostOrganism (issue #113's "aucun de
// ceux-ci" sub-step). `structureType` is a free string validated against
// the real, admin-configurable OrganismStructureType table server-side
// (dataModel.md) — not a fixed enum, so it isn't constrained further here.
export const hostOrganismInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom de l'organisme est requis"),
  structureType: z.string().trim().min(1, "Le type de structure est requis"),
  city: z.string().trim().min(1, "La ville est requise"),
  postalCode: z.string().trim().min(1, "Le code postal est requis"),
  street: z.string().trim().min(1, "L'adresse est requise"),
});

export type HostOrganismInput = z.infer<typeof hostOrganismInputSchema>;

// Inline-creation payload for a new Tutor, scoped to the organism resolved
// in the same wizard step.
export const tutorInputSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis"),
  lastName: z.string().trim().min(1, "Le nom est requis"),
  email: z.string().trim().email("Adresse email invalide"),
  jobTitle: z.string().trim().min(1, "La fonction est requise"),
  phone: frenchMobilePhoneSchema.nullable().optional(),
  acceptsPhoneContact: z.boolean().default(false),
});

export type TutorInput = z.infer<typeof tutorInputSchema>;

const existingOrNewSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().uuid() }),
    z.object({ mode: z.literal("new"), data: dataSchema }),
  ]);

// Issue #113: the whole wizard's payload. There is deliberately no
// `semester` field anywhere in this schema — BR-04b says any client-supplied
// semester is ignored, and the simplest way to guarantee that is to never
// parse one in the first place, rather than accept-and-discard it.
// `service`/`projectType`/`motivation` stay optional here: BR-02 only
// requires them at submission (issue #115), not at draft time.
export const createStageDraftSchema = z.object({
  organism: existingOrNewSchema(hostOrganismInputSchema),
  tutor: existingOrNewSchema(tutorInputSchema),
  periods: stagePeriodsSchema,
  service: z.string().trim().min(1).optional(),
  projectType: z.string().trim().min(1).optional(),
  motivation: z.string().trim().min(1).optional(),
  // No default: an explicit true/false choice must reach this schema (issue
  // #113 AC — "no silent default reaches the saved draft").
  mandatory: z.boolean(),
});

export type CreateStageDraftInput = z.infer<typeof createStageDraftSchema>;
