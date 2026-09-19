import { describe, expect, it } from "vitest";
import { listStagesQuerySchema } from "./list-stages-query.schema";

describe("listStagesQuerySchema (issue #114)", () => {
  it("defaults to sorting by nearest start date with no filter", () => {
    expect(listStagesQuerySchema.parse({})).toEqual({ sort: "startDate" });
  });

  it("accepts a status filter, a semester filter and the submission-date sort", () => {
    expect(
      listStagesQuerySchema.parse({ status: "PENDING", semester: "S2", sort: "submittedAt" }),
    ).toEqual({ status: "PENDING", semester: "S2", sort: "submittedAt" });
  });

  it.each([{ status: "ARCHIVED" }, { semester: "S3" }, { sort: "createdAt" }])(
    "rejects an unknown value: %j",
    (query) => {
      expect(listStagesQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
