import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

// Scaleway TEM currently only offers the fr-par region — not worth exposing
// as an env var for a single real choice (ADR-0026).
const SCALEWAY_TEM_ENDPOINT =
  "https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails";

// AdminStudentsService awaits send() end-to-end before returning the
// validate/reject HTTP response, and the profile's status transition has
// already committed by then — an unbounded hang here (provider outage,
// network partition) would leave that response hanging for as long as
// undici's own default timeouts allow. Bounding it keeps a mail hiccup from
// turning an already-successful admin action into a stalled request.
const SEND_TIMEOUT_MS = 10_000;

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailInput {
  to: EmailRecipient;
  cc?: EmailRecipient;
  subject: string;
  text: string;
}

// The mailer boundary (ADR-0026, spec #63): composes and sends exactly one
// email. Deciding *when* to notify a student stays with callers
// (AdminStudentsService) — this service has no business-logic knowledge.
// Swappable/mockable via Nest DI (see mailer.service.spec.ts and every
// caller's unit tests, which mock this class the same way FilesService is
// mocked elsewhere) — no test depends on a real Scaleway call succeeding.
@Injectable()
export class MailerService {
  private readonly secretKey: string;
  private readonly projectId: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(configService: ConfigService<Env, true>) {
    // Read into locals first — assigning configService.get(...) straight
    // into a typed class property has the same contextual-typing pitfall as
    // inlining it into an object literal (see jwt.strategy.ts/files.service.ts).
    const secretKey = configService.get("MAILER_SCW_SECRET_KEY", { infer: true });
    const projectId = configService.get("MAILER_SCW_PROJECT_ID", { infer: true });
    const fromEmail = configService.get("MAILER_FROM_EMAIL", { infer: true });
    const fromName = configService.get("MAILER_FROM_NAME", { infer: true });
    this.secretKey = secretKey;
    this.projectId = projectId;
    this.fromEmail = fromEmail;
    this.fromName = fromName;
  }

  async send(input: SendEmailInput): Promise<void> {
    const response = await fetch(SCALEWAY_TEM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": this.secretKey,
      },
      body: JSON.stringify({
        project_id: this.projectId,
        from: { email: this.fromEmail, name: this.fromName },
        to: [input.to],
        cc: input.cc ? [input.cc] : undefined,
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Scaleway TEM send failed: ${response.status} ${await response.text()}`);
    }
  }
}
