import { describe, expect, it } from "vitest";
import { passwordSchema } from "./password.schema";

describe("passwordSchema", () => {
  it("rejects a password shorter than 18 characters", () => {
    expect(passwordSchema.safeParse("short1234567890").success).toBe(false); // gitleaks:allow — test fixture, not a real secret
  });

  it("accepts a password of length exactly 18 (the minimum)", () => {
    expect(passwordSchema.safeParse("a".repeat(18)).success).toBe(true);
  });

  it("accepts a password of exactly 72 ASCII bytes (bcrypt's input limit)", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
  });

  it("rejects a password of 73 ASCII bytes", () => {
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  // Review follow-up on PR #81: a UTF-16 character-count max(72) doesn't
  // catch this — bcrypt would have silently truncated the password instead.
  it("rejects a password under 72 UTF-16 characters but over 72 UTF-8 bytes (accented characters)", () => {
    // "é" is 1 UTF-16 code unit but 2 UTF-8 bytes: 37 chars, 74 bytes.
    const password = "é".repeat(37);
    expect(password.length).toBeLessThanOrEqual(72);
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });

  it("accepts a password with accented characters that stays within the real 72-byte budget", () => {
    // 30 "é"s: 30 chars, 60 bytes — under budget on both counts.
    const password = "é".repeat(30);
    expect(passwordSchema.safeParse(password).success).toBe(true);
  });
});
