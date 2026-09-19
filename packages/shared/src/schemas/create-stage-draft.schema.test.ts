import { describe, expect, it } from "vitest";
import { createStageDraftSchema, hostOrganismInputSchema } from "./create-stage-draft.schema";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    organism: { mode: "existing", id: "11111111-1111-1111-1111-111111111111" },
    tutor: { mode: "existing", id: "22222222-2222-2222-2222-222222222222" },
    periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
    mandatory: true,
    ...overrides,
  };
}

describe("createStageDraftSchema", () => {
  it("accepts an existing organism + existing tutor draft", () => {
    expect(createStageDraftSchema.safeParse(basePayload()).success).toBe(true);
  });

  it("accepts an inline-created organism and tutor", () => {
    const result = createStageDraftSchema.safeParse(
      basePayload({
        organism: {
          mode: "new",
          data: {
            name: "Hôpital Cochin",
            structureType: "Secteur Sanitaire",
            city: "Paris",
            postalCode: "75014",
            street: "27 Rue du Faubourg Saint-Jacques",
          },
        },
        tutor: {
          mode: "new",
          data: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
          },
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a missing mandatory flag — no silent default is allowed to reach the draft (issue #113 AC)", () => {
    const payload = basePayload();
    delete (payload as Record<string, unknown>).mandatory;
    const result = createStageDraftSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("has no `semester` field at all — a client-supplied one is simply never parsed (BR-04b)", () => {
    const result = createStageDraftSchema.safeParse(basePayload({ semester: "S2" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("semester");
    }
  });

  it("rejects an organism id that isn't a valid uuid", () => {
    const result = createStageDraftSchema.safeParse(
      basePayload({ organism: { mode: "existing", id: "not-a-uuid" } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects periods that fail BR-04c (delegates to stagePeriodsSchema)", () => {
    const result = createStageDraftSchema.safeParse(basePayload({ periods: [] }));
    expect(result.success).toBe(false);
  });

  it("allows service/projectType/motivation to be omitted at draft time (BR-02: only required at submission)", () => {
    const result = createStageDraftSchema.safeParse(basePayload());
    expect(result.success).toBe(true);
  });
});

describe("hostOrganismInputSchema postalCode (French postal codes are exactly 5 digits)", () => {
  const organism = (postalCode: string) => ({
    name: "Hôpital Cochin",
    structureType: "Secteur Sanitaire",
    city: "Paris",
    postalCode,
    street: "27 Rue du Faubourg Saint-Jacques",
  });

  it.each(["75014", "01000", "20000"])("accepts %s", (postalCode) => {
    expect(hostOrganismInputSchema.safeParse(organism(postalCode)).success).toBe(true);
  });

  it("trims surrounding whitespace before checking", () => {
    const result = hostOrganismInputSchema.safeParse(organism(" 75014 "));
    expect(result.success && result.data.postalCode).toBe("75014");
  });

  it.each(["", "7501", "750144", "75O14", "7501a", "75 014", "+7501"])(
    "rejects %j",
    (postalCode) => {
      expect(hostOrganismInputSchema.safeParse(organism(postalCode)).success).toBe(false);
    },
  );

  it("explains the rule in French", () => {
    const result = hostOrganismInputSchema.safeParse(organism("7501"));
    expect(!result.success && result.error.issues[0]?.message).toBe(
      "Le code postal doit contenir 5 chiffres",
    );
  });
});
