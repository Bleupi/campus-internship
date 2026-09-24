---
"api": patch
---

`MailerService.sendSafely()` now logs a successful send (`Logger.log`, `Emailed <email>: "<subject>"`) via the caller's own Logger, not just a failed one (ADR-0026's shared catch-and-log policy). Application logs previously stayed silent on the happy path, leaving no in-app signal that an email actually went out — Scaleway's own activity dashboard was the only place to confirm it. This doesn't change the "catch, log, don't propagate" contract itself: a failed send still only logs, never rejects.
