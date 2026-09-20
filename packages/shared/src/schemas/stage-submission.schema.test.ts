import { describe, expect, it } from "vitest";
import {
  getSubmissionBlockers,
  isBeforeCurrentSchoolYear,
  type SubmissionCandidate,
} from "./stage-submission.schema";

// The fixture periods are in October 2025 (school year 2025-2026), so every
// test that isn't about the previous-year rule fixes "today" inside it rather
// than depending on the real clock.
const TODAY = new Date("2025-11-01T10:00:00.000Z");

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
    expect(getSubmissionBlockers(readyCandidate(), TODAY)).toEqual([]);
  });

  it.each(["INCOMPLETE", "PENDING_VALIDATION", "EXPIRED"] as const)(
    "BR-02: blocks submission with a profile reason when the profile is %s",
    (profileStatus) => {
      const blockers = getSubmissionBlockers(readyCandidate({ profileStatus }), TODAY);

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
    const blockers = getSubmissionBlockers(readyCandidate(overrides), TODAY);

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(reason);
  });

  it("completeness: treats a whitespace-only text field as missing", () => {
    const blockers = getSubmissionBlockers(readyCandidate({ service: "   " }), TODAY);

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/service/i);
  });

  it("completeness: blocks a request with no period", () => {
    const blockers = getSubmissionBlockers(readyCandidate({ periods: [] }), TODAY);

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/période/i);
  });

  it("BR-05a: blocks a request whose period ends exactly at the next 09-01 00:00 (half-open bound)", () => {
    const blockers = getSubmissionBlockers(
      readyCandidate({
        periods: [{ startDate: "2025-10-01T00:00:00.000Z", endDate: "2026-09-01T00:00:00.000Z" }],
      }),
      TODAY,
    );

    expect(blockers.some((message) => /période/i.test(message))).toBe(true);
  });

  it("reports every blocker at once, profile first", () => {
    const blockers = getSubmissionBlockers(
      readyCandidate({ profileStatus: "INCOMPLETE", service: null, motivation: null }),
      TODAY,
    );

    expect(blockers).toHaveLength(3);
    expect(blockers[0]).toMatch(/profil/i);
  });

  it("allows a period that started before today, as long as it is in the current school year (a posteriori request)", () => {
    expect(getSubmissionBlockers(readyCandidate(), new Date("2026-02-01T00:00:00.000Z"))).toEqual(
      [],
    );
  });

  it("blocks a request whose periods are in the previous school year, with a reason naming the school year", () => {
    const blockers = getSubmissionBlockers(readyCandidate(), new Date("2026-09-20T00:00:00.000Z"));

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/année scolaire précédente/i);
  });

  it("BR-01: the previous-year block starts exactly at the next 09-01 00:00 (half-open bound)", () => {
    expect(getSubmissionBlockers(readyCandidate(), new Date("2026-08-31T23:59:59.999Z"))).toEqual(
      [],
    );
    expect(
      getSubmissionBlockers(readyCandidate(), new Date("2026-09-01T00:00:00.000Z")),
    ).toHaveLength(1);
  });

  it("does not add the previous-year reason on top of the periods reason when there is no valid period", () => {
    const blockers = getSubmissionBlockers(
      readyCandidate({ periods: [] }),
      new Date("2026-09-20T00:00:00.000Z"),
    );

    expect(blockers).toEqual(["Ajoutez au moins une période valide."]);
  });
});

describe("isBeforeCurrentSchoolYear (issue #115)", () => {
  it("is true for a date in an earlier school year than today's, false otherwise", () => {
    const today = new Date("2026-09-20T00:00:00.000Z");

    expect(isBeforeCurrentSchoolYear(new Date("2026-08-31T23:59:59.999Z"), today)).toBe(true);
    expect(isBeforeCurrentSchoolYear(new Date("2026-09-01T00:00:00.000Z"), today)).toBe(false);
    expect(isBeforeCurrentSchoolYear(new Date("2027-01-10T00:00:00.000Z"), today)).toBe(false);
  });
});
