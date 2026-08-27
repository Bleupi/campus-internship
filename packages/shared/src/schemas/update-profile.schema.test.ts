import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./update-profile.schema";

describe("updateProfileSchema", () => {
  it("accepts an empty object (a partial patch may touch no field)", () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a valid promotion value", () => {
    const result = updateProfileSchema.safeParse({ promotion: "L3" });
    expect(result.success).toBe(true);
  });

  it("rejects a promotion value outside PROMOTIONS", () => {
    const result = updateProfileSchema.safeParse({ promotion: "M1" });
    expect(result.success).toBe(false);
  });

  it("accepts phone and personalEmail together", () => {
    const result = updateProfileSchema.safeParse({
      phone: "0601020304",
      personalEmail: "etu@gmail.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for phone and personalEmail (explicit clear)", () => {
    const result = updateProfileSchema.safeParse({ phone: null, personalEmail: null });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed personalEmail", () => {
    const result = updateProfileSchema.safeParse({ personalEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string phone", () => {
    const result = updateProfileSchema.safeParse({ phone: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a landline-format phone (mobile-only, per PR #17 review)", () => {
    const result = updateProfileSchema.safeParse({ phone: "0512345678" });
    expect(result.success).toBe(false);
  });
});
