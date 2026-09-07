import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./update-profile.schema";
import { STUDENT_EMAIL_DOMAIN } from "./university-email.schema";

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

  it("gives a French error message for a malformed personalEmail", () => {
    const result = updateProfileSchema.safeParse({ personalEmail: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe("Adresse email invalide");
    }
  });

  it("rejects a personalEmail on the etu.u-paris.fr domain", () => {
    const result = updateProfileSchema.safeParse({
      personalEmail: `etu.dupont${STUDENT_EMAIL_DOMAIN}`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a personalEmail on the etu.u-paris.fr domain regardless of case", () => {
    const result = updateProfileSchema.safeParse({ personalEmail: "etu.dupont@ETU.U-PARIS.FR" });
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
