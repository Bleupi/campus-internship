import { describe, expect, it } from "vitest";
import { frenchMobilePhoneSchema } from "./phone.schema";

describe("frenchMobilePhoneSchema", () => {
  it.each([
    ["0612345678", "bare national, 06"],
    ["0712345678", "bare national, 07"],
    ["06 12 34 56 78", "space-separated"],
    ["07 12 34 56 78", "space-separated, 07"],
    ["06.12.34.56.78", "dot-separated"],
    ["06-12-34-56-78", "dash-separated"],
    ["+33612345678", "international, no separators"],
    ["+33712345678", "international, 07"],
    ["+33 6 12 34 56 78", "international, space-separated"],
    ["0033612345678", "00 33 international prefix"],
  ])("accepts %s (%s)", (value) => {
    const result = frenchMobilePhoneSchema.safeParse(value);
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const result = frenchMobilePhoneSchema.safeParse("  0612345678  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("0612345678");
    }
  });

  it.each([
    ["0512345678", "landline (05), not mobile"],
    ["0812345678", "special-services number (08), not mobile"],
    ["0912345678", "non-geographic number (09), not mobile"],
    ["061234567", "too short (9 digits)"],
    ["06123456789", "too long (11 digits)"],
    ["06 12 34 56 7a", "contains a letter"],
    ["+34612345678", "wrong country code"],
    ["1234567890", "missing leading 0/+33"],
    ["", "empty string"],
    ["   ", "whitespace only"],
  ])("rejects %s (%s)", (value) => {
    const result = frenchMobilePhoneSchema.safeParse(value);
    expect(result.success).toBe(false);
  });
});
