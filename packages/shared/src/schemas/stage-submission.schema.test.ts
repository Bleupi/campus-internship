import { describe, expect, it } from "vitest";
import { getSubmissionBlockers, type SubmissionCandidate } from "./stage-submission.schema";

function readyCandidate(overrides: Partial<SubmissionCandidate> = {}): SubmissionCandidate {
  return {
    profileStatus: "VALID",
    hasOrganism: true,
    hasTutor: true,
    service: "Cardiologie",
    projectType: "Handicap moteur",
    motivation: "Je souhaite découvrir le métier.",
    periods: [{ startDate: "2025-10-01T00:00:00.000Z", endDate: "2025-10-15T00:00:00.000Z" }],
    ...overrides,
  };
}

describe("getSubmissionBlockers (issue #115)", () => {
  it("returns no blocker for a complete request from a VALID profile", () => {
    expect(getSubmissionBlockers(readyCandidate())).toEqual([]);
  });

  it.each(["INCOMPLETE", "PENDING_VALIDATION", "EXPIRED"] as const)(
    "BR-02: blocks submission with a profile reason when the profile is %s",
    (profileStatus) => {
      const blockers = getSubmissionBlockers(readyCandidate({ profileStatus }));

      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toMatch(/profil/i);
    },
  );

  it.each([
    ["organism", { hasOrganism: false }, /organisme/i],
    ["tutor", { hasTutor: false }, /tuteur/i],
    ["service", { service: null }, /service/i],
    ["project type", { projectType: null }, /handicap/i],
    ["motivation", { motivation: null }, /motivation/i],
  ] as const)("completeness: names the missing %s", (_field, overrides, reason) => {
    const blockers = getSubmissionBlockers(readyCandidate(overrides));

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(reason);
  });

  it("completeness: treats a whitespace-only text field as missing", () => {
    const blockers = getSubmissionBlockers(readyCandidate({ service: "   " }));

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/service/i);
  });

  it("completeness: blocks a request with no period", () => {
    const blockers = getSubmissionBlockers(readyCandidate({ periods: [] }));

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/période/i);
  });

  it("BR-05a: blocks a request whose period ends exactly at the next 09-01 00:00 (half-open bound)", () => {
    const blockers = getSubmissionBlockers(
      readyCandidate({
        periods: [{ startDate: "2025-10-01T00:00:00.000Z", endDate: "2026-09-01T00:00:00.000Z" }],
      }),
    );

    expect(blockers.some((message) => /période/i.test(message))).toBe(true);
  });

  it("reports every blocker at once, profile first", () => {
    const blockers = getSubmissionBlockers(
      readyCandidate({ profileStatus: "INCOMPLETE", service: null, motivation: null }),
    );

    expect(blockers).toHaveLength(3);
    expect(blockers[0]).toMatch(/profil/i);
  });
});
