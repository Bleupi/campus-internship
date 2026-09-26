import { describe, expect, it } from "vitest";
import { buildRejectReason, REJECT_REASONS } from "./reject-reason";

describe("buildRejectReason — issue #43: client-side concatenation into rejectProfileSchema's single `reason` string", () => {
  it("renders checked canned reasons as bullets", () => {
    const result = buildRejectReason([REJECT_REASONS[0], REJECT_REASONS[1]], "");
    expect(result).toBe(`- ${REJECT_REASONS[0]}\n- ${REJECT_REASONS[1]}`);
  });

  it("appends free text as a trailing unbulleted 'Autre précision : …' line", () => {
    const result = buildRejectReason([REJECT_REASONS[0]], "Photo floue en page 2");
    expect(result).toBe(`- ${REJECT_REASONS[0]}\nAutre précision : Photo floue en page 2`);
  });

  it("trims free text before appending it", () => {
    const result = buildRejectReason([], "  Photo floue  ");
    expect(result).toBe("Autre précision : Photo floue");
  });

  it("omits the 'Autre précision' line entirely when free text is empty/whitespace-only", () => {
    const result = buildRejectReason([REJECT_REASONS[0]], "   ");
    expect(result).toBe(`- ${REJECT_REASONS[0]}`);
  });

  it("returns an empty string when nothing is checked and free text is empty", () => {
    expect(buildRejectReason([], "")).toBe("");
  });
});
