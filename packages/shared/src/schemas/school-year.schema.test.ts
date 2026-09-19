import { describe, expect, it } from "vitest";
import {
  getCurrentSchoolYear,
  getSchoolYearEnd,
  getSchoolYearStart,
  getSemesterBoundary,
  schoolYearSchema,
} from "./school-year.schema";

describe("schoolYearSchema", () => {
  it("accepts a well-formed schoolYear where the second year is the first + 1", () => {
    const result = schoolYearSchema.safeParse("2024-2025");
    expect(result.success).toBe(true);
  });

  it("rejects a value that doesn't match the YYYY-YYYY format", () => {
    const result = schoolYearSchema.safeParse("2024/2025");
    expect(result.success).toBe(false);
  });

  it("rejects a value where the second year isn't first + 1 (ADR-0012 N+1 rule)", () => {
    const result = schoolYearSchema.safeParse("2024-2026");
    expect(result.success).toBe(false);
  });

  it("rejects a value with the years reversed", () => {
    const result = schoolYearSchema.safeParse("2025-2024");
    expect(result.success).toBe(false);
  });

  it("trims leading/trailing whitespace before validating (ADR-0012 normalization)", () => {
    const result = schoolYearSchema.safeParse("  2024-2025  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("2024-2025");
    }
  });

  it("still rejects a malformed value once whitespace is trimmed away", () => {
    const result = schoolYearSchema.safeParse("  2024/2025  ");
    expect(result.success).toBe(false);
  });
});

describe("getCurrentSchoolYear", () => {
  it("returns the school year starting the same calendar year on/after September 1 (BR-01)", () => {
    expect(getCurrentSchoolYear(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-2027");
  });

  it("returns the school year starting the previous calendar year before September 1", () => {
    expect(getCurrentSchoolYear(new Date("2026-01-15T00:00:00.000Z"))).toBe("2025-2026");
  });

  it("returns the school year starting the previous calendar year on August 31 just before the boundary", () => {
    expect(getCurrentSchoolYear(new Date("2026-08-31T23:59:59.999Z"))).toBe("2025-2026");
  });

  it("defaults to the current date when none is provided", () => {
    const result = getCurrentSchoolYear();
    expect(result).toMatch(/^\d{4}-\d{4}$/);
  });
});

describe("getSchoolYearEnd", () => {
  it("returns the half-open upper bound (BR-05c): (YYYY+1)-09-01T00:00:00 UTC", () => {
    expect(getSchoolYearEnd("2025-2026")).toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });

  it("is the boundary getCurrentSchoolYear treats as belonging to the NEXT year (ADR-0009 half-open tiling)", () => {
    const end = getSchoolYearEnd("2025-2026");
    expect(getCurrentSchoolYear(end)).toBe("2026-2027");
    expect(getCurrentSchoolYear(new Date(end.getTime() - 1))).toBe("2025-2026");
  });
});

describe("getSchoolYearStart", () => {
  it("returns the inclusive lower bound (BR-01/ADR-0009): YYYY-09-01T00:00:00 UTC", () => {
    expect(getSchoolYearStart("2025-2026")).toEqual(new Date("2025-09-01T00:00:00.000Z"));
  });

  it("is exactly the previous school year's getSchoolYearEnd (ADR-0009 half-open tiling)", () => {
    expect(getSchoolYearStart("2025-2026")).toEqual(getSchoolYearEnd("2024-2025"));
  });
});

describe("getSemesterBoundary", () => {
  it("returns January 1st of the second calendar year (BR-05a/b)", () => {
    expect(getSemesterBoundary("2025-2026")).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("falls strictly between the school year's start and end (ADR-0009 tiling)", () => {
    const boundary = getSemesterBoundary("2025-2026");
    expect(boundary.getTime()).toBeGreaterThan(getSchoolYearStart("2025-2026").getTime());
    expect(boundary.getTime()).toBeLessThan(getSchoolYearEnd("2025-2026").getTime());
  });
});
