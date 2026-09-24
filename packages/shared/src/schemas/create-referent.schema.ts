import { z } from "zod";

// Issue #150 (ADR-0031): the "add a referent" form of the assignment picker.
// Deliberately no institutional-domain check on `email` (ADR-0025 stands on
// that point) — a referent can be external to the university.
export const createReferentSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis"),
  lastName: z.string().trim().min(1, "Le nom est requis"),
  email: z.string().trim().email("Adresse email invalide"),
});
