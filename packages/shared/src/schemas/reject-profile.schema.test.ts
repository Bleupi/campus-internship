import { describe, expect, it } from "vitest";
import { rejectProfileSchema } from "./reject-profile.schema";

describe("rejectProfileSchema", () => {
  it("accepts a non-empty reason", () => {
    const result = rejectProfileSchema.safeParse({ reason: "Certificat illisible" });
    expect(result.success).toBe(true);
  });

  it("trims the reason", () => {
    const result = rejectProfileSchema.safeParse({ reason: "  Certificat illisible  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("Certificat illisible");
    }
  });

  it("rejects an empty reason", () => {
    const result = rejectProfileSchema.safeParse({ reason: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    const result = rejectProfileSchema.safeParse({ reason: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const result = rejectProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
