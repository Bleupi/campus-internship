import { describe, expect, it } from "vitest";
import { refuseStageSchema } from "./refuse-stage.schema";

const VALID = { version: 0, reason: "L'adresse de l'organisme est incomplète." };

describe("refuseStageSchema", () => {
  it("accepts a version and a non-empty reason", () => {
    expect(refuseStageSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(refuseStageSchema.safeParse({ ...VALID, reason: "   " }).success).toBe(false);
  });

  it("rejects a missing reason", () => {
    expect(refuseStageSchema.safeParse({ version: 0 }).success).toBe(false);
  });

  it("rejects a negative version", () => {
    expect(refuseStageSchema.safeParse({ ...VALID, version: -1 }).success).toBe(false);
  });

  it("rejects a non-integer version", () => {
    expect(refuseStageSchema.safeParse({ ...VALID, version: 1.5 }).success).toBe(false);
  });
});
