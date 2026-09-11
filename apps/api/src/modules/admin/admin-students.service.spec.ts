import { Readable } from "node:stream";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { FilesService } from "../files/files.service";
import { MailerService } from "../mailer/mailer.service";
import { AdminStudentsService } from "./admin-students.service";

const STUDENT_ID = "profile-1";
const UNIVERSITY_EMAIL = "etudiant@etu.u-pariscite.fr";
const PERSONAL_EMAIL = "perso@example.com";
const STUDENT_FIRST_NAME = "Camille";
const REFUSAL_REASON = "Attestation illisible";
const ADMIN = { firstName: "Jean", lastName: "Martin" };

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
  let mailerService: { sendSafely: jest.Mock };

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
    mailerService = { sendSafely: jest.fn().mockResolvedValue(undefined) };

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
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      const result = await service.validateProfile(STUDENT_ID, ADMIN);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION"] } },
        data: { profileStatus: "VALID", refusalReason: null },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "VALID" });
    });

    it("issue #66: clears any stale refusalReason on a direct validation", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.validateProfile(STUDENT_ID, ADMIN);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ refusalReason: null }) }),
      );
    });

    it("BR-11: emails the university address only, no cc, when no personal address is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.validateProfile(STUDENT_ID, ADMIN);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toBeUndefined();
    });

    it("BR-11: also cc's the personal address when one is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: PERSONAL_EMAIL,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.validateProfile(STUDENT_ID, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toEqual({ email: PERSONAL_EMAIL });
    });

    it("structures the email with a personalized greeting and a signature, not just the raw status", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.validateProfile(STUDENT_ID, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.subject).toBe("Votre profil a été validé");
      expect(input.text.startsWith(`Bonjour ${STUDENT_FIRST_NAME},`)).toBe(true);
      expect(input.text.endsWith("Cordialement,\nMARTIN Jean")).toBe(true);
    });

    it("BR-11: names the validating admin, with their function, in the body — not 'l'administration'", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.validateProfile(STUDENT_ID, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.text).toContain("validé par MARTIN Jean, responsable de stages L2 et L3 APA-S.");
      expect(input.text).not.toContain("l'administration");
      // The function title appears only in the body sentence, never in the signature.
      expect(input.text).not.toContain("Cordialement,\nMARTIN Jean, responsable");
    });

    // The "catch, log, don't propagate" guarantee itself now lives in
    // MailerService.sendSafely() (mailer.service.spec.ts) — this only
    // checks AdminStudentsService delegates to it rather than calling
    // send() directly (which would have no catch of its own here).
    it("delegates to MailerService.sendSafely(), not send() directly", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      const result = await service.validateProfile(STUDENT_ID, ADMIN);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "VALID" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "VALID",
      });

      await expect(service.validateProfile(STUDENT_ID, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.validateProfile(STUDENT_ID, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("rejectProfile — ADR-0004: PENDING_VALIDATION/VALID -> INCOMPLETE", () => {
    it("flips PENDING_VALIDATION or VALID to INCOMPLETE via a status-conditioned updateMany", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      const result = await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, profileStatus: { in: ["PENDING_VALIDATION", "VALID"] } },
        data: { profileStatus: "INCOMPLETE", refusalReason: REFUSAL_REASON },
      });
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "INCOMPLETE" });
    });

    it("issue #66: persists the refusal reason on the profile, not just the notification email", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refusalReason: REFUSAL_REASON }),
        }),
      );
    });

    it("BR-11: emails the university address with the refusal reason in the body", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.to).toEqual({ email: UNIVERSITY_EMAIL });
      expect(input.cc).toBeUndefined();
      expect(input.text).toContain(REFUSAL_REASON);
    });

    it("BR-11: also cc's the personal address when one is on file", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: PERSONAL_EMAIL,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.cc).toEqual({ email: PERSONAL_EMAIL });
    });

    it("structures the reason as one paragraph among a greeting, an intro, next steps, and a signature — not the whole email", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.subject).toBe("Votre profil a été refusé");
      expect(input.text.startsWith(`Bonjour ${STUDENT_FIRST_NAME},`)).toBe(true);
      expect(input.text).toContain(`pour le motif suivant :\n\n${REFUSAL_REASON}`);
      expect(input.text).toContain("Merci de mettre à jour votre profil");
      expect(input.text.endsWith("Cordialement,\nMARTIN Jean")).toBe(true);
    });

    it("BR-11: names the refusing admin, with their function, in the body — not 'l'administration'", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      const input = mailerService.sendSafely.mock.calls[0][0];
      expect(input.text).toContain(
        "examiné par MARTIN Jean, responsable de stages L2 et L3 APA-S,",
      );
      expect(input.text).not.toContain("l'administration");
      // The function title appears only in the body sentence, never in the signature.
      expect(input.text).not.toContain("Cordialement,\nMARTIN Jean, responsable");
    });

    // The "catch, log, don't propagate" guarantee itself now lives in
    // MailerService.sendSafely() (mailer.service.spec.ts) — this only
    // checks AdminStudentsService delegates to it rather than calling
    // send() directly (which would have no catch of its own here).
    it("delegates to MailerService.sendSafely(), not send() directly", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
        personalEmail: null,
        user: { email: UNIVERSITY_EMAIL, firstName: STUDENT_FIRST_NAME },
      });

      const result = await service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN);

      expect(mailerService.sendSafely).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ studentId: STUDENT_ID, profileStatus: "INCOMPLETE" });
    });

    it("throws ConflictException when no row matched the conditional update (wrong source status)", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        profileStatus: "INCOMPLETE",
      });

      await expect(service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the student profile does not exist", async () => {
      prisma.studentProfile.updateMany.mockResolvedValue({ count: 0 });
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(service.rejectProfile(STUDENT_ID, REFUSAL_REASON, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
