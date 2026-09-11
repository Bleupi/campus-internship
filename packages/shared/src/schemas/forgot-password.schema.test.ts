import { describe, expect, it } from "vitest";
import { forgotPasswordSchema } from "./forgot-password.schema";

describe("forgotPasswordSchema", () => {
  it("accepts any well-formed email, regardless of domain (BR-13 applies to every role)", () => {
    expect(forgotPasswordSchema.safeParse({ email: "etu.dupont@etu.u-paris.fr" }).success).toBe(
      true,
    );
    expect(forgotPasswordSchema.safeParse({ email: "admin@example.org" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
  });
});
