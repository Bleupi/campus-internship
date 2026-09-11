import { describe, expect, it } from "vitest";
import { resetPasswordSchema } from "./reset-password.schema";

const validPayload = {
  token: "a-raw-reset-token",
  newPassword: "a".repeat(18),
};

describe("resetPasswordSchema", () => {
  it("accepts a valid token + newPassword payload", () => {
    expect(resetPasswordSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects an empty token", () => {
    expect(resetPasswordSchema.safeParse({ ...validPayload, token: "" }).success).toBe(false);
  });

  it("rejects a newPassword shorter than 18 characters, the same rule signupSchema enforces", () => {
    expect(
      resetPasswordSchema.safeParse({ ...validPayload, newPassword: "short1234567890" }).success, // gitleaks:allow — test fixture, not a real secret
    ).toBe(false);
  });

  it("rejects a newPassword longer than 72 characters (bcrypt's input limit)", () => {
    expect(
      resetPasswordSchema.safeParse({ ...validPayload, newPassword: "a".repeat(73) }).success,
    ).toBe(false);
  });
});
