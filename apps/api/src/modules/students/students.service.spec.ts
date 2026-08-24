import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FilesService } from "../files/files.service";
import { StudentsService } from "./students.service";

const USER_ID = "user-1";
const PROFILE_ID = "profile-1";

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    userId: USER_ID,
    promotion: null,
    phone: null,
    personalEmail: null,
    profileStatus: "INCOMPLETE",
    profileYear: null,
    ...overrides,
  };
}

function idPhotoFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-photo-1",
    type: "ID_PHOTO",
    bucketKey: "students/profile-1/ID_PHOTO/abc",
    mimeType: "image/png",
    sizeBytes: 100,
    expiresAt: null,
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    studentProfileId: PROFILE_ID,
    ...overrides,
  };
}

function certificateFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-cert-1",
    type: "INSURANCE_CERTIFICATE",
    bucketKey: "students/profile-1/INSURANCE_CERTIFICATE/abc",
    mimeType: "application/pdf",
    sizeBytes: 200,
    expiresAt: null,
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    studentProfileId: PROFILE_ID,
    ...overrides,
  };
}

describe("StudentsService", () => {
  let service: StudentsService;
  let prisma: {
    studentProfile: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    fileObject: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let filesService: { upload: jest.Mock };

  beforeEach(() => {
    prisma = {
      studentProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      fileObject: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    filesService = { upload: jest.fn().mockResolvedValue(undefined) };

    service = new StudentsService(
      prisma as unknown as PrismaService,
      filesService as unknown as FilesService,
    );
  });

  describe("getProfile", () => {
    it("throws NotFoundException when the user has no student profile", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns only metadata for files, never bucketKey", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(baseProfile());
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile()]);

      const result = await service.getProfile(USER_ID);

      expect(result.files).toEqual([
        {
          type: "ID_PHOTO",
          mimeType: "image/png",
          uploadedAt: idPhotoFile().uploadedAt.toISOString(),
        },
      ]);
      expect(JSON.stringify(result)).not.toContain("bucketKey");
    });
  });

  describe("updateProfile — completion transition (INCOMPLETE -> PENDING_VALIDATION)", () => {
    it("does not transition when only promotion is set but files are missing", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(baseProfile());
      prisma.fileObject.findMany.mockResolvedValue([]);
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.updateProfile(USER_ID, { promotion: "L2" });

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBeUndefined();
    });

    it("transitions to PENDING_VALIDATION and sets profileYear only once promotion + both files are present", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(baseProfile());
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.updateProfile(USER_ID, { promotion: "L3" });

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBe("PENDING_VALIDATION");
      expect(data.profileYear).toEqual(expect.any(String));
      expect(data.profileYear).toMatch(/^\d{4}-\d{4}$/);
    });
  });

  describe("updateProfile — VALID regression", () => {
    it("regresses VALID to PENDING_VALIDATION when promotion changes", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(
        baseProfile({ promotion: "L2", profileStatus: "VALID", profileYear: "2025-2026" }),
      );
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.updateProfile(USER_ID, { promotion: "L3" });

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBe("PENDING_VALIDATION");
      // profileYear is untouched on a VALID regression (only the completion
      // transition sets it) — it must not appear in the write payload.
      expect(data.profileYear).toBeUndefined();
    });

    it("does not regress VALID when promotion is submitted unchanged", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(
        baseProfile({ promotion: "L2", profileStatus: "VALID", profileYear: "2025-2026" }),
      );
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.updateProfile(USER_ID, { promotion: "L2" });

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBeUndefined();
    });

    it("never changes profileStatus when only phone/personalEmail are edited", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(
        baseProfile({ promotion: "L2", profileStatus: "VALID", profileYear: "2025-2026" }),
      );
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.updateProfile(USER_ID, { phone: "0601020304", personalEmail: "etu@gmail.com" });

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBeUndefined();
      expect(data.phone).toBe("0601020304");
      expect(data.personalEmail).toBe("etu@gmail.com");
    });
  });

  describe("uploadFile", () => {
    it("always creates a new FileObject row rather than mutating an existing one", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(baseProfile());
      prisma.fileObject.findMany.mockResolvedValue([]);
      prisma.fileObject.create.mockResolvedValue(idPhotoFile());
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.uploadFile(USER_ID, "ID_PHOTO", {
        buffer: Buffer.from("bytes"),
        mimetype: "image/png",
        size: 100,
      } as Express.Multer.File);

      expect(prisma.fileObject.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.fileObject.create.mock.calls[0][0].data;
      expect(createArgs.expiresAt).toBeNull();
      expect(createArgs.type).toBe("ID_PHOTO");
      expect(filesService.upload).toHaveBeenCalledTimes(1);
    });

    it("regresses VALID to PENDING_VALIDATION when the insurance certificate is re-uploaded", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(
        baseProfile({ promotion: "L2", profileStatus: "VALID", profileYear: "2025-2026" }),
      );
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.fileObject.create.mockResolvedValue(certificateFile({ id: "file-cert-2" }));
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.uploadFile(USER_ID, "INSURANCE_CERTIFICATE", {
        buffer: Buffer.from("bytes"),
        mimetype: "application/pdf",
        size: 200,
      } as Express.Multer.File);

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBe("PENDING_VALIDATION");
    });

    it("does not regress VALID, and skips the write entirely, when the id photo (not the certificate) is re-uploaded", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(
        baseProfile({ promotion: "L2", profileStatus: "VALID", profileYear: "2025-2026" }),
      );
      // Post-upload state: id photo replaced, certificate untouched.
      prisma.fileObject.findMany.mockResolvedValue([
        idPhotoFile({ id: "file-photo-2" }),
        certificateFile(),
      ]);
      prisma.fileObject.create.mockResolvedValue(idPhotoFile({ id: "file-photo-2" }));

      await service.uploadFile(USER_ID, "ID_PHOTO", {
        buffer: Buffer.from("bytes"),
        mimetype: "image/png",
        size: 100,
      } as Express.Multer.File);

      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it("triggers the completion transition when the last missing piece (a file) is uploaded", async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(baseProfile({ promotion: "L2" }));
      // Post-upload state: both files now present.
      prisma.fileObject.findMany.mockResolvedValue([idPhotoFile(), certificateFile()]);
      prisma.fileObject.create.mockResolvedValue(certificateFile());
      prisma.studentProfile.update.mockImplementation(({ data }) =>
        Promise.resolve(baseProfile({ ...data })),
      );

      await service.uploadFile(USER_ID, "INSURANCE_CERTIFICATE", {
        buffer: Buffer.from("bytes"),
        mimetype: "application/pdf",
        size: 200,
      } as Express.Multer.File);

      const data = prisma.studentProfile.update.mock.calls[0][0].data;
      expect(data.profileStatus).toBe("PENDING_VALIDATION");
      expect(data.profileYear).toMatch(/^\d{4}-\d{4}$/);
    });
  });
});
