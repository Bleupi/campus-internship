import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api-client";
import { readStageConflict } from "./stage-conflict";

function conflict(body: unknown) {
  return new ApiError(409, typeof body === "string" ? body : JSON.stringify(body));
}

describe("readStageConflict", () => {
  it("reads the code and the server's French message from a 409 body", () => {
    const error = conflict({ code: "STAGE_VERSION_CONFLICT", message: "Rechargez la page." });

    expect(readStageConflict(error)).toEqual({
      code: "STAGE_VERSION_CONFLICT",
      message: "Rechargez la page.",
    });
  });

  it("recognises the frozen-row code", () => {
    expect(readStageConflict(conflict({ code: "STAGE_ROW_FROZEN", message: "Figé." }))?.code).toBe(
      "STAGE_ROW_FROZEN",
    );
  });

  it("is null for a 409 without a known code (e.g. a plain Nest conflict)", () => {
    expect(readStageConflict(conflict({ message: "Conflict" }))).toBeNull();
    expect(readStageConflict(conflict({ code: "SOMETHING_ELSE", message: "x" }))).toBeNull();
  });

  it("is null for a body that is not JSON", () => {
    expect(readStageConflict(conflict("Bad gateway"))).toBeNull();
  });

  it("is null for any other status or a non-API error", () => {
    expect(
      readStageConflict(new ApiError(400, JSON.stringify({ code: "STAGE_VERSION_CONFLICT" }))),
    ).toBeNull();
    expect(readStageConflict(new Error("boom"))).toBeNull();
  });
});
