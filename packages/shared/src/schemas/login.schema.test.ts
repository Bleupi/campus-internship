import { describe, expect, it } from "vitest";
import { loginSchema } from "./login.schema";

describe("loginSchema", () => {
  it("accepts a valid email/password pair", () => {
    const result = loginSchema.safeParse({
      email: "etu.dupont@etu.u-paris.fr",
      password: "whatever-the-user-typed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "whatever-the-user-typed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "etu.dupont@etu.u-paris.fr",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("does not re-validate password length or domain rules (login isn't signup)", () => {
    const result = loginSchema.safeParse({
      email: "etu.dupont@gmail.com",
      password: "short",
    });
    expect(result.success).toBe(true);
  });
});
