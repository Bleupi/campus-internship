---
"api": minor
"shared": minor
---

Add self-service password reset for every role (BR-13, issue #79) — `POST /auth/forgot-password` and `POST /auth/reset-password`.

- `packages/shared`: `forgotPasswordSchema`, `resetPasswordSchema`, and a `passwordSchema` extracted from `signupSchema`'s inline password rule (`z.string().min(18).max(72)`) so both never diverge (ADR-0012's single-implementation principle, applied here for the first time beyond `schoolYear`). New `ForgotPasswordRequest`/`ForgotPasswordResponse`/`ResetPasswordRequest`/`ResetPasswordResponse` contracts in `auth.contract.ts`.
- `apps/api`: a new `PasswordResetToken` Prisma model (opaque token, SHA-256-hashed at rest, 20-minute expiry — mirrors `RefreshToken`'s pattern in its own table). `AuthService.forgotPassword()`/`resetPassword()` and two new `@Public()` routes. The forgot-password response is identical whether or not the email matches an account (anti-enumeration); a new request invalidates any still-live token for that account first. A successful reset updates the password, deletes the consumed token, revokes every `RefreshToken` on the account (all sessions logged out), and never issues a session. Both the reset link and the confirmation email go to `User.email` only, never `StudentProfile.personalEmail` — a deliberate deviation from BR-11's to+cc pattern. New `WEB_APP_URL` env var builds the absolute reset link.

The forgot-password confirmation message now also reminds the user to check their spam/junk folder — the reset link itself stays out of the email body per `docs/wayfinder-forgot-password.md` (a test send landed in spam), so the reminder lives in the response shown right after submission instead.

No web UI yet — the frontend reset-password screen is a separate, blocked ticket.
