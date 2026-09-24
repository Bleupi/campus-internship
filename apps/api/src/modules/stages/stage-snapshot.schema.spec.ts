import { snapshotV1 } from "../../../test/helpers/stage-snapshot";
import { parseStageSnapshot } from "./stage-snapshot.schema";

describe("parseStageSnapshot (ADR-0003, ADR-0033)", () => {
  it("BR-08: parses a version 1 snapshot into the frozen stage content", () => {
    expect(parseStageSnapshot(snapshotV1(), 1)).toEqual(snapshotV1());
  });

  it("ignores keys it does not know, so a later writer can add fields without breaking readers", () => {
    expect(parseStageSnapshot(snapshotV1({ student: { firstName: "Étu" } }), 1)).toEqual(
      snapshotV1(),
    );
  });

  it("BR-03: rejects a snapshot without a referent, it is never null once frozen", () => {
    expect(() => parseStageSnapshot(snapshotV1({ referent: null }), 1)).toThrow();
  });

  it("freezes who decided and when, with the admin's title at that time", () => {
    const parsed = parseStageSnapshot(snapshotV1(), 1);

    expect(parsed.decidedAt).toBe("2025-09-10T09:30:00.000Z");
    expect(parsed.decidedBy).toEqual({
      id: "admin-1",
      firstName: "Alice",
      lastName: "Martin",
      title: "responsable de stages L2 et L3 APA-S",
    });
  });

  it("freezes the student's promotion at decision time", () => {
    expect(parseStageSnapshot(snapshotV1({ promotion: "L3" }), 1).promotion).toBe("L3");
  });

  it.each([
    ["no decision date", { decidedAt: undefined }],
    ["a malformed decision date", { decidedAt: "yesterday" }],
    ["no deciding admin", { decidedBy: undefined }],
    ["an admin without a title", { decidedBy: { id: "a", firstName: "A", lastName: "M" } }],
    ["no promotion", { promotion: undefined }],
    ["an unknown promotion", { promotion: "M2" }],
  ])("rejects a snapshot with %s", (_label, overrides) => {
    expect(() => parseStageSnapshot(snapshotV1(overrides), 1)).toThrow();
  });

  it.each([
    ["a malformed school year", { schoolYear: "2025-2027" }],
    ["an unknown semester", { semester: "S3" }],
    ["no organism", { organism: undefined }],
    ["a period without dates", { periods: [{ id: "p1" }] }],
  ])("rejects a snapshot with %s", (_label, overrides) => {
    expect(() => parseStageSnapshot(snapshotV1(overrides), 1)).toThrow();
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
  ])("rejects a snapshot that is %s", (_label, value) => {
    expect(() => parseStageSnapshot(value, 1)).toThrow();
  });

  it.each([null, 0, 2])("rejects the unknown snapshot version %s", (version) => {
    expect(() => parseStageSnapshot(snapshotV1(), version)).toThrow(/version/i);
  });
});
