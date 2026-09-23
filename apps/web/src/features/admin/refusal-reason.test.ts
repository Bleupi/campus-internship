import { describe, expect, it } from "vitest";
import {
  buildRefusalReason,
  isRefusalReasonComplete,
  MISSING_INFO_REASON,
  REFUSAL_REASONS,
} from "./refusal-reason";

describe("buildRefusalReason — issue #151: client-side concatenation into refuseStageSchema's single `reason` string", () => {
  it("renders checked canned reasons as bullets", () => {
    const result = buildRefusalReason([REFUSAL_REASONS[0], REFUSAL_REASONS[3]], "", "");
    expect(result).toBe(`- ${REFUSAL_REASONS[0]}\n- ${REFUSAL_REASONS[3]}`);
  });

  it("puts the missing-information detail on the same bullet line, not a separate one", () => {
    const result = buildRefusalReason([MISSING_INFO_REASON], "le certificat de scolarité", "");
    expect(result).toBe(`- ${MISSING_INFO_REASON} le certificat de scolarité`);
  });

  it("trims the missing-information detail before appending it", () => {
    const result = buildRefusalReason([MISSING_INFO_REASON], "  le certificat  ", "");
    expect(result).toBe(`- ${MISSING_INFO_REASON} le certificat`);
  });

  it("appends free text as a trailing unbulleted 'Autre précision : …' line", () => {
    const result = buildRefusalReason([REFUSAL_REASONS[0]], "", "Adresse à vérifier");
    expect(result).toBe(`- ${REFUSAL_REASONS[0]}\nAutre précision : Adresse à vérifier`);
  });

  it("omits the 'Autre précision' line entirely when free text is empty/whitespace-only", () => {
    expect(buildRefusalReason([REFUSAL_REASONS[0]], "", "   ")).toBe(`- ${REFUSAL_REASONS[0]}`);
  });

  it("returns an empty string when nothing is checked and free text is empty", () => {
    expect(buildRefusalReason([], "", "")).toBe("");
  });

  it("combines several checked reasons (one of them the missing-info one) and free text", () => {
    const result = buildRefusalReason(
      [REFUSAL_REASONS[0], MISSING_INFO_REASON],
      "le certificat",
      "Précision libre",
    );
    expect(result).toBe(
      `- ${REFUSAL_REASONS[0]}\n- ${MISSING_INFO_REASON} le certificat\nAutre précision : Précision libre`,
    );
  });
});

describe("isRefusalReasonComplete — issue #151: the Refuse button's disabled rule", () => {
  it("is false when nothing is checked and free text is empty", () => {
    expect(isRefusalReasonComplete([], "", "")).toBe(false);
  });

  it("is true once a non-missing-info reason is checked", () => {
    expect(isRefusalReasonComplete([REFUSAL_REASONS[0]], "", "")).toBe(true);
  });

  it("is true when only free text is given, no box checked", () => {
    expect(isRefusalReasonComplete([], "", "Précision")).toBe(true);
  });

  it("is false when the missing-information reason is checked but its detail is empty", () => {
    expect(isRefusalReasonComplete([MISSING_INFO_REASON], "", "")).toBe(false);
    expect(isRefusalReasonComplete([MISSING_INFO_REASON], "   ", "")).toBe(false);
  });

  it("is true when the missing-information reason is checked and its detail is filled", () => {
    expect(isRefusalReasonComplete([MISSING_INFO_REASON], "le certificat", "")).toBe(true);
  });

  it("still requires the missing-info detail even when other reasons are also checked", () => {
    expect(isRefusalReasonComplete([REFUSAL_REASONS[0], MISSING_INFO_REASON], "", "")).toBe(false);
  });
});
