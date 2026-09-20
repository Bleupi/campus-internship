import { describe, expect, it } from "vitest";
import { updateStageDraftSchema } from "./update-stage-draft.schema";

const organismData = {
  name: "Hôpital Cochin",
  structureType: "Secteur Sanitaire",
  city: "Paris",
  postalCode: "75014",
  street: "27 Rue du Faubourg Saint-Jacques",
};

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 0,
    organism: { mode: "existing", id: "11111111-1111-1111-1111-111111111111" },
    tutor: { mode: "existing", id: "22222222-2222-2222-2222-222222222222" },
    periods: [{ startDate: "2025-10-01", endDate: "2025-10-15" }],
    mandatory: true,
    ...overrides,
  };
}

describe("updateStageDraftSchema", () => {
  it("accepts an existing organism + existing tutor update", () => {
    expect(updateStageDraftSchema.safeParse(basePayload()).success).toBe(true);
  });

  it("BR-09: requires the version the client read", () => {
    expect(updateStageDraftSchema.safeParse(basePayload({ version: undefined })).success).toBe(
      false,
    );
  });

  it("BR-09: rejects a negative or non-integer version", () => {
    expect(updateStageDraftSchema.safeParse(basePayload({ version: -1 })).success).toBe(false);
    expect(updateStageDraftSchema.safeParse(basePayload({ version: 1.5 })).success).toBe(false);
  });

  it("accepts an in-place edit of the organism's fields, carrying the row id", () => {
    const result = updateStageDraftSchema.safeParse(
      basePayload({
        organism: {
          mode: "edit",
          id: "11111111-1111-1111-1111-111111111111",
          data: organismData,
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates the edited organism's fields with the same rules as inline creation", () => {
    const result = updateStageDraftSchema.safeParse(
      basePayload({
        organism: {
          mode: "edit",
          id: "11111111-1111-1111-1111-111111111111",
          data: { ...organismData, postalCode: "7501" },
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts an in-place edit of the tutor's fields", () => {
    const result = updateStageDraftSchema.safeParse(
      basePayload({
        tutor: {
          mode: "edit",
          id: "22222222-2222-2222-2222-222222222222",
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

  it("BR-04b: has no semester field, so a client-supplied one never reaches the service", () => {
    const result = updateStageDraftSchema.safeParse(basePayload({ semester: "S2" }));
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("semester");
  });

  it("applies the shared period rules (BR-04c): rejects overlapping periods", () => {
    const result = updateStageDraftSchema.safeParse(
      basePayload({
        periods: [
          { startDate: "2025-10-01", endDate: "2025-10-15" },
          { startDate: "2025-10-10", endDate: "2025-10-20" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("requires an explicit mandatory choice", () => {
    expect(updateStageDraftSchema.safeParse(basePayload({ mandatory: undefined })).success).toBe(
      false,
    );
  });
});
