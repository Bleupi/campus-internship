import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readEnvVar } from "./env";

describe("readEnvVar", () => {
  it("returns the parsed value when valid", () => {
    expect(readEnvVar("http://localhost:3000", "VITE_API_BASE_URL", z.string().url())).toBe(
      "http://localhost:3000",
    );
  });

  it("trims surrounding whitespace before validating", () => {
    expect(readEnvVar("  http://localhost:3000  ", "VITE_API_BASE_URL", z.string().url())).toBe(
      "http://localhost:3000",
    );
  });

  it("throws when the value is undefined", () => {
    expect(() => readEnvVar(undefined, "VITE_API_BASE_URL", z.string().url())).toThrow(
      /VITE_API_BASE_URL/,
    );
  });

  it("throws when the value is an empty string", () => {
    expect(() => readEnvVar("", "VITE_API_BASE_URL", z.string().url())).toThrow(
      /VITE_API_BASE_URL/,
    );
  });

  it("throws when the value is set but fails the schema", () => {
    expect(() => readEnvVar("not-a-url", "VITE_API_BASE_URL", z.string().url())).toThrow(
      /VITE_API_BASE_URL/,
    );
  });
});
