import { describe, expect, it } from "vitest";
import { STUDENT_EMAIL_DOMAIN } from "./university-email.schema";

describe("university email domains", () => {
  it("locks STUDENT_EMAIL_DOMAIN to the real student institutional domain", () => {
    expect(STUDENT_EMAIL_DOMAIN).toBe("@etu.u-paris.fr");
  });
});
