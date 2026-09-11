---
"api": minor
"shared": minor
---

Add self-service password reset for every role (BR-13, issue #79) — `POST /auth/forgot-password` and `POST /auth/reset-password`.

- `packages/shared`: `forgotPasswordSchema`, `resetPasswordSchema`, and a `passwordSchema` extracted from `signupSchema`'s inline password rule (`z.string().min(18).max(72)`) so both never diverge (ADR-0012's single-implementation principle, applied here for the first time beyond `schoolYear`). New `ForgotPasswordRequest`/`ForgotPasswordResponse`/`ResetPasswordRequest`/`ResetPasswordResponse` contracts in `auth.contract.ts`.
- `apps/api`: a new `PasswordResetToken` Prisma model (opaque token, SHA-256-hashed at rest, 20-minute expiry — mirrors `RefreshToken`'s pattern in its own table). `AuthService.forgotPassword()`/`resetPassword()` and two new `@Public()` routes. The forgot-password response is identical whether or not the email matches an account (anti-enumeration); a new request invalidates any still-live token for that account first. A successful reset updates the password, deletes the consumed token, revokes every `RefreshToken` on the account (all sessions logged out), and never issues a session. Both the reset link and the confirmation email go to `User.email` only, never `StudentProfile.personalEmail` — a deliberate deviation from BR-11's to+cc pattern. New `WEB_APP_URL` env var builds the absolute reset link.

The forgot-password confirmation message now also reminds the user to check their spam/junk folder — the reset link itself stays out of the email body per `docs/wayfinder-forgot-password.md` (a test send landed in spam), so the reminder lives in the response shown right after submission instead.

Code-review follow-up (PR #81): `PasswordResetToken.userId` is now unique, and `forgotPassword()` reissues a token via a single atomic `upsert` instead of a separate `deleteMany` + `create` — closes a race where two concurrent requests for the same account could otherwise both survive as distinct live tokens. `resetPassword()` now claims the token with an atomic `deleteMany` inside its transaction instead of trusting an earlier `findUnique`, so a concurrent request racing on the same token gets the documented generic 400 instead of an accidental 404.

Second review pass:

- `forgotPassword()`'s response is now padded to a fixed 150ms floor, closing a residual timing side channel (a known email cost one extra DB round trip vs. an unknown one) on top of the already-unawaited email send. `WEB_APP_URL` with a trailing slash no longer produces a malformed double-slash reset link.
- `passwordSchema` (`packages/shared`) now checks the real UTF-8 byte count against bcrypt's 72-byte limit instead of UTF-16 character length — a password under 72 characters but over 72 bytes (accented characters) was previously accepted and then silently truncated by bcrypt.
- `MailerService.sendSafely()` centralizes the "catch mailer errors, log, don't propagate" policy (ADR-0026) that `AuthService` and `AdminStudentsService` each implemented separately.
- New ADR-0027 records the anti-enumeration/token-model/concurrency decisions above.

No web UI yet — the frontend reset-password screen is a separate, blocked ticket.
