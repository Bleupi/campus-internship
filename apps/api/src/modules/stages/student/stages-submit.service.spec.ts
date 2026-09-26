import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { StagesService } from "./stages.service";
import {
  PROFILE_ID,
  USER_ID,
  createStagesServiceTestBed,
  stageRow,
  type MailerServiceMock,
  type PrismaMock,
} from "./stages.service.spec-helpers";

describe("StagesService", () => {
  let service: StagesService;
  let prisma: PrismaMock;
  let mailerService: MailerServiceMock;

  beforeEach(async () => {
    ({ service, prisma, mailerService } = await createStagesServiceTestBed());
  });

  // Issue #115. The service reads the draft twice: once to gate it, then again
  // through getById() to answer with the fresh detail.
  describe("submit", () => {
    function draftForSubmit(overrides: Record<string, unknown> = {}) {
      return stageRow({
        studentId: PROFILE_ID,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Je souhaite découvrir le métier.",
        version: 3,
        student: { profileStatus: "VALID", user: { firstName: "Ada", lastName: "Lovelace" } },
        ...overrides,
      });
    }

    // The fixture periods are in October 2025: freeze only Date inside that
    // school year so the previous-year rule doesn't depend on the real clock.
    function freezeToday(isoDate: string) {
      jest.useFakeTimers({
        now: new Date(isoDate),
        doNotFake: [
          "nextTick",
          "setImmediate",
          "clearImmediate",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "queueMicrotask",
          "hrtime",
          "performance",
        ],
      });
    }

    afterEach(() => jest.useRealTimers());

    beforeEach(() => {
      freezeToday("2025-11-01T10:00:00.000Z");
      prisma.stage.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findMany.mockResolvedValue([{ email: "admin@example.org" }]);
      prisma.referentAssignment.findUnique.mockResolvedValue(null);
    });

    function primeSuccess(draft = draftForSubmit()) {
      prisma.stage.findFirst.mockResolvedValueOnce(draft).mockResolvedValueOnce({
        ...draft,
        status: "PENDING",
        submittedAt: new Date("2025-09-05"),
      });
    }

    it("looks the stage up by id AND owner, so another student's stage is a 404", async () => {
      prisma.stage.findFirst.mockResolvedValue(null);

      await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "stage-1", student: { userId: USER_ID } } }),
      );
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
    });

    it.each(["PENDING", "VALIDATED", "REFUSED"])(
      "rejects a stage that is %s, not DRAFT, without touching it or emailing anyone",
      async (status) => {
        prisma.stage.findFirst.mockResolvedValue(draftForSubmit({ status }));

        await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it.each(["INCOMPLETE", "PENDING_VALIDATION", "EXPIRED"])(
      "BR-02: rejects submission with a %s profile and leaves the stage DRAFT",
      async (profileStatus) => {
        prisma.stage.findFirst.mockResolvedValue(
          draftForSubmit({ student: { profileStatus, user: { firstName: "Ada", lastName: "L" } } }),
        );

        await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["organism", { organism: null, organismId: null }, /organisme/i],
      ["tutor", { tutor: null, tutorId: null }, /tuteur/i],
      ["service", { service: null }, /service/i],
      ["project type", { projectType: null }, /handicap/i],
      ["motivation", { motivation: null }, /motivation/i],
      ["period", { periods: [] }, /période/i],
    ])(
      "submission-completeness: rejects a draft missing its %s and says which one",
      async (_field, overrides, reason) => {
        prisma.stage.findFirst.mockResolvedValue(draftForSubmit(overrides));

        const error = await service.submit(USER_ID, "stage-1").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(JSON.stringify((error as BadRequestException).getResponse())).toMatch(reason);
        expect(prisma.stage.updateMany).not.toHaveBeenCalled();
        expect(mailerService.sendSafely).not.toHaveBeenCalled();
      },
    );

    it("BR-01: rejects a draft whose periods are in the previous school year, leaving it DRAFT", async () => {
      freezeToday("2026-09-20T10:00:00.000Z");
      prisma.stage.findFirst.mockResolvedValue(draftForSubmit());

      const error = await service.submit(USER_ID, "stage-1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).toMatch(
        /année scolaire précédente/,
      );
      expect(prisma.stage.updateMany).not.toHaveBeenCalled();
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });

    it("allows submitting a draft whose period already started, within the current school year (a posteriori request)", async () => {
      freezeToday("2026-02-01T10:00:00.000Z");
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
    });

    it("moves a complete DRAFT to PENDING, sets submittedAt, and returns the fresh detail", async () => {
      primeSuccess();

      const result = await service.submit(USER_ID, "stage-1");

      expect(prisma.stage.updateMany).toHaveBeenCalledWith({
        where: { id: "stage-1", status: "DRAFT", version: 3 },
        data: { status: "PENDING", submittedAt: expect.any(Date), version: { increment: 1 } },
      });
      expect(result.status).toBe("PENDING");
      expect(result.submittedAt).toBe("2025-09-05T00:00:00.000Z");
    });

    it("BR-09: answers 409 and emails nobody when the stage changed since it was read (0 rows updated)", async () => {
      prisma.stage.findFirst.mockResolvedValue(draftForSubmit());
      prisma.stage.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.submit(USER_ID, "stage-1")).rejects.toBeInstanceOf(ConflictException);
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });

    it("BR-07: emails every ADMIN with the student's name and the organism", async () => {
      prisma.user.findMany.mockResolvedValue([
        { email: "admin1@example.org" },
        { email: "admin2@example.org" },
      ]);
      primeSuccess();

      await service.submit(USER_ID, "stage-1");

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roles: { has: "ADMIN" } } }),
      );
      expect(mailerService.sendSafely).toHaveBeenCalledTimes(2);
      const first = mailerService.sendSafely.mock.calls[0][0];
      expect(first.to).toEqual({ email: "admin1@example.org" });
      expect(first.text).toContain("Ada Lovelace");
      expect(first.text).toContain("Hôpital Cochin");
      expect(mailerService.sendSafely.mock.calls[1][0].to).toEqual({ email: "admin2@example.org" });
    });

    it("BR-07: still succeeds, the transition being committed, when the admin lookup itself fails", async () => {
      prisma.user.findMany.mockRejectedValue(new Error("connection reset"));
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
    });

    it("BR-07: still succeeds when there is no admin to notify", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      primeSuccess();

      await expect(service.submit(USER_ID, "stage-1")).resolves.toMatchObject({
        status: "PENDING",
      });
      expect(mailerService.sendSafely).not.toHaveBeenCalled();
    });
  });
});
