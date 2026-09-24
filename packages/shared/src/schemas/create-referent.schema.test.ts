import { describe, expect, it } from "vitest";
import { createReferentSchema } from "./create-referent.schema";

const VALID = { firstName: "Claire", lastName: "Martin", email: "claire.martin@example.org" };

describe("createReferentSchema", () => {
  it("accepts a first name, last name and email", () => {
    const result = createReferentSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("trims every field", () => {
    const result = createReferentSchema.parse({
      firstName: "  Claire ",
      lastName: " Martin  ",
      email: "  claire.martin@example.org ",
    });
    expect(result).toEqual(VALID);
  });

  it("rejects a blank first name or last name", () => {
    expect(createReferentSchema.safeParse({ ...VALID, firstName: "   " }).success).toBe(false);
    expect(createReferentSchema.safeParse({ ...VALID, lastName: "" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = createReferentSchema.safeParse({ ...VALID, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("ADR-0031: accepts any email domain — no institutional-domain check", () => {
    const result = createReferentSchema.safeParse({ ...VALID, email: "someone@gmail.com" });
    expect(result.success).toBe(true);
  });
});
