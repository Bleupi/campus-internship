import { Readable } from "node:stream";
import { ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { FilesService } from "../files/files.service";
import { MailerService } from "../mailer/mailer.service";
import { AdminStudentsService } from "./admin-students.service";

const STUDENT_ID = "profile-1";
const UNIVERSITY_EMAIL = "etudiant@etu.u-pariscite.fr";

describe("AdminStudentsService", () => {
  let service: AdminStudentsService;
  let prisma: {
    studentProfile: {
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
    };
    fileObject: {
      findFirst: jest.Mock;
    };
  };
  let filesService: { download: jest.Mock };
  let mailerService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      studentProfile: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
      },
      fileObject: {
        findFirst: jest.fn(),
      },
    };
    filesService = { download: jest.fn() };
    mailerService = { send: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AdminStudentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: filesService },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get(AdminStudentsService);
  });

  describe("validateProfile — ADR-0004: PENDING_VALIDATION -> VALID", () => {
    it("flips PENDING_VALIDATION to VALID via a status-conditioned updateMany", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      const result = await service.validateProfile(STUDENT_ID);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION"] } },
        data: { profileStatus: "VALID" },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "VALID" });
    });

    it("BR-11: emails the university address only, no cc, when no personal address is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.validateProfile(STUDENT_ID);

      expect(mailerService.send).toHaveBeenCalledTimes(1);
      const input = mailerService.send.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toBeUndefined();
    });

    it("BR-11: also cc's the personal address when one is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: "perso@example.com",
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.validateProfile(STUDENT_ID);

      const input = mailerService.send.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toEqual({ email: "perso@example.com" });
    });

    it("structures the email with a personalized greeting and a signature, not just the raw status", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.validateProfile(STUDENT_ID);

      const input = mailerService.send.mock.calls[0][0];
      expect(input.text.startsWith("Bonjour Camille,")).toBe(true);
      expect(input.text).toContain("Cordialement,\nL'équipe de gestion des stages");
    });

    it("still returns success when the mailer send fails — the status change already committed", async () => {
      jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });
      mailerService.send.mockRejectedValue(new Error("Scaleway TEM send failed: 401"));

      const result = await service.validateProfile(STUDENT_ID);

      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "VALID" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "VALID",
      });

      await expect(service.validateProfile(STUDENT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.validateProfile(STUDENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("rejectProfile — ADR-0004: PENDING_VALIDATION/VALID -> INCOMPLETE", () => {
    it("flips PENDING_VALIDATION or VALID to INCOMPLETE via a status-conditioned updateMany", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      const result = await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION", "VALID"] } },
        data: { profileStatus: "INCOMPLETE" },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "INCOMPLETE" });
    });

    it("BR-11: emails the university address with the refusal reason in the body", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      expect(mailerService.send).toHaveBeenCalledTimes(1);
      const input = mailerService.send.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toBeUndefined();
      expect(input.text).toContain("Certificat illisible");
    });

    it("BR-11: also cc's the personal address when one is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: "perso@example.com",
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      const input = mailerService.send.mock.calls[0][0];
      expect(input.cc).toEqual({ email: "perso@example.com" });
    });

    it("structures the reason as one paragraph among a greeting, an intro, next steps, and a signature — not the whole email", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });

      await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      const input = mailerService.send.mock.calls[0][0];
      expect(input.text.startsWith("Bonjour Camille,")).toBe(true);
      expect(input.text).toContain("pour le motif suivant :\n\nCertificat illisible");
      expect(input.text).toContain("Merci de mettre à jour votre profil");
      expect(input.text).toContain("Cordialement,\nL'équipe de gestion des stages");
    });

    it("still returns success when the mailer send fails — the status change already committed", async () => {
      jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: "Camille" },
      });
      mailerService.send.mockRejectedValue(new Error("Scaleway TEM send failed: 401"));

      const result = await service.rejectProfile(STUDENT_ID, "Certificat illisible");

      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "INCOMPLETE" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "INCOMPLETE",
      });

      await expect(
        service.rejectProfile(STUDENT_ID, "Certificat illisible"),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectProfile(STUDENT_ID, "Certificat illisible"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("getCertificateStream — issue #43: certificate proxy", () => {
    it("streams the current non-expired INSURANCE_CERTIFICATE via FilesService", async () => {
      prisma.fileObject.findFirst.mockResolvedValue({
        bucketKey: "students/profile-1/INSURANCE_CERTIFICATE/abc",
        mimeType: "application/pdf",
      });
      const stream = Readable.from([Buffer.from("pdf-bytes")]);
      filesService.download.mockResolvedValue(stream);

      const result = await service.getCertificateStream(STUDENT_ID);

      expect(prisma.fileObject.findFirst).toHaveBeenCalledWith({
        where: {
          studentProfileId: STUDENT_ID,
          type: "INSURANCE_CERTIFICATE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        orderBy: { uploadedAt: "desc" },
      });
      expect(filesService.download).toHaveBeenCalledWith(
        "students/profile-1/INSURANCE_CERTIFICATE/abc",
      );
      expect(result).toEqual({ stream, mimeType: "application/pdf" });
    });

    it("throws NotFoundException when no current certificate exists", async () => {
      prisma.fileObject.findFirst.mockResolvedValue(null);

      await expect(service.getCertificateStream(STUDENT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(filesService.download).not.toHaveBeenCalled();
    });
  });
});
