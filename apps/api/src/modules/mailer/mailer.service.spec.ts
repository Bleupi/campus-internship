import type { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MailerService } from "./mailer.service";

const CONFIG: Record<string, string> = {
  MAILER_SCW_SECRET_KEY: "scw-secret",
  MAILER_SCW_PROJECT_ID: "project-1",
  MAILER_FROM_EMAIL: "no-reply@example.org",
  MAILER_FROM_NAME: "Gestion des stages",
};

describe("MailerService — ADR-0026: Scaleway Transactional Email", () => {
  let service: MailerService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(fetchMock);

    const module = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => CONFIG[key] },
        },
      ],
    }).compile();

    service = module.get(MailerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POSTs the Scaleway TEM emails endpoint with the auth token, sender, and recipients", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => "" });

    await service.send({
      to: { email: "etudiant@etu.u-pariscite.fr" },
      cc: { email: "perso@example.com" },
      subject: "Votre profil a été validé",
      text: "Votre certificat d'assurance a été validé.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "X-Auth-Token": "scw-secret",
      "Content-Type": "application/json",
    });
    // A hung Scaleway call would otherwise block the caller's HTTP response
    // (AdminStudentsService awaits this end-to-end) — this bounds it.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      project_id: "project-1",
      from: { email: "no-reply@example.org", name: "Gestion des stages" },
      to: [{ email: "etudiant@etu.u-pariscite.fr" }],
      cc: [{ email: "perso@example.com" }],
      subject: "Votre profil a été validé",
      text: "Votre certificat d'assurance a été validé.",
    });
  });

  it("omits cc entirely when no cc recipient is given", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => "" });

    await service.send({
      to: { email: "etudiant@etu.u-pariscite.fr" },
      subject: "Votre profil a été validé",
      text: "Votre certificat d'assurance a été validé.",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).cc).toBeUndefined();
  });

  it("throws when Scaleway responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid secret key",
    });

    await expect(
      service.send({
        to: { email: "etudiant@etu.u-pariscite.fr" },
        subject: "Sujet",
        text: "Texte",
      }),
    ).rejects.toThrow(/401/);
  });

  // Shared "catch, log, don't propagate" policy (review follow-up on PR
  // #81): previously duplicated identically in AuthService.sendMail() and
  // AdminStudentsService.notifyStudent(); both now delegate here.
  describe("sendSafely() — shared catch-and-log policy", () => {
    it("delegates to send() and resolves normally on success, without logging", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => "" });
      const logger = { error: jest.fn() };

      await expect(
        service.sendSafely(
          { to: { email: "etudiant@etu.u-pariscite.fr" }, subject: "Sujet", text: "Texte" },
          logger as unknown as Logger,
        ),
      ).resolves.toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("catches a send() failure and logs it via the caller's own Logger, without rejecting", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
      const logger = { error: jest.fn() };

      await expect(
        service.sendSafely(
          { to: { email: "etudiant@etu.u-pariscite.fr" }, subject: "Sujet", text: "Texte" },
          logger as unknown as Logger,
        ),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0]).toContain("etudiant@etu.u-pariscite.fr");
    });
  });
});
