import {
  FileType as PrismaFileType,
  ProfileStatus as PrismaProfileStatus,
  Promotion as PrismaPromotion,
  Role as PrismaRole,
  Semester as PrismaSemester,
  StageStatus as PrismaStageStatus,
} from "@prisma/client";
import { FILE_TYPES, PROFILE_STATUSES, PROMOTIONS, ROLES, SEMESTERS, STAGE_STATUSES } from "shared";

function sortedValues(prismaEnum: Record<string, string>): string[] {
  return Object.values(prismaEnum).sort();
}

describe("Prisma enums stay in sync with packages/shared", () => {
  it("Role matches ROLES", () => {
    expect(sortedValues(PrismaRole)).toEqual([...ROLES].sort());
  });

  it("Semester matches SEMESTERS", () => {
    expect(sortedValues(PrismaSemester)).toEqual([...SEMESTERS].sort());
  });

  it("ProfileStatus matches PROFILE_STATUSES", () => {
    expect(sortedValues(PrismaProfileStatus)).toEqual([...PROFILE_STATUSES].sort());
  });

  it("StageStatus matches STAGE_STATUSES", () => {
    expect(sortedValues(PrismaStageStatus)).toEqual([...STAGE_STATUSES].sort());
  });

  it("FileType matches FILE_TYPES", () => {
    expect(sortedValues(PrismaFileType)).toEqual([...FILE_TYPES].sort());
  });

  it("Promotion matches PROMOTIONS", () => {
    expect(sortedValues(PrismaPromotion)).toEqual([...PROMOTIONS].sort());
  });
});
