import { describe, expect, it } from "vitest";
import { assignReferentSchema } from "./assign-referent.schema";

const VALID = {
  studentId: "11111111-1111-1111-1111-111111111111",
  schoolYear: "2026-2027",
  semester: "S1",
  mandatory: true,
  referentId: "22222222-2222-2222-2222-222222222222",
};

describe("assignReferentSchema", () => {
  it("accepts a full four-tuple plus the referent id", () => {
    const result = assignReferentSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid studentId", () => {
    const result = assignReferentSchema.safeParse({ ...VALID, studentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid referentId", () => {
    const result = assignReferentSchema.safeParse({ ...VALID, referentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid schoolYear format", () => {
    const result = assignReferentSchema.safeParse({ ...VALID, schoolYear: "2026" });
    expect(result.success).toBe(false);
  });

  it("rejects a semester outside S1/S2", () => {
    const result = assignReferentSchema.safeParse({ ...VALID, semester: "S3" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing mandatory flag", () => {
    const { studentId, schoolYear, semester, referentId } = VALID;
    const result = assignReferentSchema.safeParse({ studentId, schoolYear, semester, referentId });
    expect(result.success).toBe(false);
  });
});
