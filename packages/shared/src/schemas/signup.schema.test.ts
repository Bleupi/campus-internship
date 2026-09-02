import { describe, expect, it } from "vitest";
import { signupSchema } from "./signup.schema";

const validPayload = {
  email: "etu.dupont@u-pariscite.fr",
  password: "correct horse battery staple",
  firstName: "Étu",
  lastName: "Dupont",
};

describe("signupSchema", () => {
  it("accepts a valid @u-pariscite.fr signup payload", () => {
    const result = signupSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects an email outside the @u-pariscite.fr domain", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      email: "etu.dupont@gmail.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 18 characters", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      password: "short1234567890", // gitleaks:allow — test fixture, not a real secret
    });
    expect(result.success).toBe(false);
  });

  it("accepts a password of length exactly 18 (the minimum)", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      password: "a".repeat(18),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a password of length exactly 72 (bcrypt's input limit)", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      password: "a".repeat(72),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password longer than 72 characters (bcrypt's input limit)", () => {
    const result = signupSchema.safeParse({
      ...validPayload,
      password: "a".repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank firstName", () => {
    expect(signupSchema.safeParse({ ...validPayload, firstName: "" }).success).toBe(false);
  });

  it("accepts a non-empty firstName", () => {
    expect(signupSchema.safeParse({ ...validPayload, firstName: "Étu" }).success).toBe(true);
  });

  it("rejects a blank lastName", () => {
    expect(signupSchema.safeParse({ ...validPayload, lastName: "" }).success).toBe(false);
  });

  it("accepts a non-empty lastName", () => {
    expect(signupSchema.safeParse({ ...validPayload, lastName: "Dupont" }).success).toBe(true);
  });
});
