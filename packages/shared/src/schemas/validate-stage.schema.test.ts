import { describe, expect, it } from "vitest";
import { validateStageSchema } from "./validate-stage.schema";

describe("validateStageSchema", () => {
  it("accepts a non-negative integer version", () => {
    expect(validateStageSchema.safeParse({ version: 0 }).success).toBe(true);
  });

  it("rejects a missing version", () => {
    expect(validateStageSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a negative version", () => {
    expect(validateStageSchema.safeParse({ version: -1 }).success).toBe(false);
  });

  it("rejects a non-integer version", () => {
    expect(validateStageSchema.safeParse({ version: 1.5 }).success).toBe(false);
  });
});
