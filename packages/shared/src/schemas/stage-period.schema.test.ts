import { describe, expect, it } from "vitest";
import { deriveSemester, stagePeriodsSchema } from "./stage-period.schema";

function period(start: string, end: string) {
  return { startDate: start, endDate: end };
}

describe("stagePeriodsSchema", () => {
  it("rejects an empty periods array (BR-04c: at least one period)", () => {
    const result = stagePeriodsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects a period whose endDate is before its startDate (BR-04c)", () => {
    const result = stagePeriodsSchema.safeParse([period("2025-10-15", "2025-10-01")]);
    expect(result.success).toBe(false);
  });

  it("accepts a period whose endDate equals its startDate (BR-04c: endDate >= startDate)", () => {
    const result = stagePeriodsSchema.safeParse([period("2025-10-01", "2025-10-01")]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping periods (BR-04c)", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2025-10-01", "2025-10-15"),
      period("2025-10-10", "2025-10-20"),
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts adjacent periods that touch at the half-open boundary (ADR-0009: end exclusive)", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2025-10-01T00:00:00.000Z", "2025-10-15T00:00:00.000Z"),
      period("2025-10-15T00:00:00.000Z", "2025-10-20T00:00:00.000Z"),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects periods that span two different school years (BR-04c)", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2025-10-01", "2025-10-15"),
      period("2026-10-01", "2026-10-15"),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a period ending exactly at next September 1st 00:00 (BR-05c half-open upper bound)", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2025-08-20T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts a period ending 1ms before next September 1st 00:00 (BR-05c)", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2026-08-20T00:00:00.000Z", "2026-08-31T23:59:59.999Z"),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a period starting before the school year's own boundary", () => {
    const result = stagePeriodsSchema.safeParse([
      period("2025-08-31T23:59:59.999Z", "2025-10-01T00:00:00.000Z"),
    ]);
    expect(result.success).toBe(false);
  });
});

describe("deriveSemester", () => {
  it("derives S1 when every period falls entirely in semester 1 (BR-04b)", () => {
    const periods = stagePeriodsSchema.parse([period("2025-10-01", "2025-11-01")]);
    expect(deriveSemester(periods)).toBe("S1");
  });

  it("derives S2 when every period falls entirely in semester 2 (BR-04b)", () => {
    const periods = stagePeriodsSchema.parse([period("2026-02-01", "2026-03-01")]);
    expect(deriveSemester(periods)).toBe("S2");
  });

  it("derives S1 when periods straddle both semesters — S1 wins (BR-04b)", () => {
    const periods = stagePeriodsSchema.parse([period("2025-12-20", "2026-01-10")]);
    expect(deriveSemester(periods)).toBe("S1");
  });

  it("derives S1 when separate periods each sit fully in a different semester — straddle still wins S1", () => {
    const periods = stagePeriodsSchema.parse([
      period("2025-10-01", "2025-10-15"),
      period("2026-02-01", "2026-02-15"),
    ]);
    expect(deriveSemester(periods)).toBe("S1");
  });
});
