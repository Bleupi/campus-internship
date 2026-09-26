import { describe, expect, it } from "vitest";
import { buildRefusalReason, isRefusalReasonComplete, REFUSAL_REASONS } from "./refusal-reason";

describe("buildRefusalReason — issue #151: client-side concatenation into refuseStageSchema's single `reason` string", () => {
  it("renders checked canned reasons as bullets", () => {
    const result = buildRefusalReason([REFUSAL_REASONS[0], REFUSAL_REASONS[2]], "");
    expect(result).toBe(`- ${REFUSAL_REASONS[0]}\n- ${REFUSAL_REASONS[2]}`);
  });

  it("appends free text as a trailing unbulleted 'Autre précision : …' line", () => {
    const result = buildRefusalReason([REFUSAL_REASONS[0]], "Adresse à vérifier");
    expect(result).toBe(`- ${REFUSAL_REASONS[0]}\nAutre précision : Adresse à vérifier`);
  });

  it("trims free text before appending it", () => {
    const result = buildRefusalReason([REFUSAL_REASONS[0]], "  Adresse à vérifier  ");
    expect(result).toBe(`- ${REFUSAL_REASONS[0]}\nAutre précision : Adresse à vérifier`);
  });

  it("omits the 'Autre précision' line entirely when free text is empty/whitespace-only", () => {
    expect(buildRefusalReason([REFUSAL_REASONS[0]], "   ")).toBe(`- ${REFUSAL_REASONS[0]}`);
  });

  it("returns an empty string when nothing is checked and free text is empty", () => {
    expect(buildRefusalReason([], "")).toBe("");
  });

  it("builds free text alone, with no checked reason", () => {
    expect(buildRefusalReason([], "le certificat de scolarité")).toBe(
      "Autre précision : le certificat de scolarité",
    );
  });
});

describe("isRefusalReasonComplete — issue #151: the Refuse button's disabled rule", () => {
  it("is false when nothing is checked and free text is empty", () => {
    expect(isRefusalReasonComplete([], "")).toBe(false);
  });

  it("is true once a reason is checked", () => {
    expect(isRefusalReasonComplete([REFUSAL_REASONS[0]], "")).toBe(true);
  });

  it("is true when only free text is given, no box checked", () => {
    expect(isRefusalReasonComplete([], "Précision")).toBe(true);
  });

  it("is false when free text is whitespace-only and nothing is checked", () => {
    expect(isRefusalReasonComplete([], "   ")).toBe(false);
  });
});
