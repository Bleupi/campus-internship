import { describe, expect, it } from "vitest";
import { createStageDraftSchema } from "./create-stage-draft.schema";

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
            structureType: "Hôpital",
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
