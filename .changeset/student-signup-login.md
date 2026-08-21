---
"api": minor
"web": minor
"shared": minor
---

Add student self-service signup and login (issue #10) — the auth foundation every other student screen sits behind.

- `packages/shared`: `signupSchema`/`loginSchema` (Zod, `@u-paris.fr`-restricted, length-only password policy per NIST 800-63B) and their `AuthUser`/`SignupResponse`/`LoginResponse`/`MeResponse`/`RefreshResponse` contracts.
- `apps/api`: `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`. JWT access token (15 min) + rotating refresh token (7 days, multi-session via a new `RefreshToken` table) delivered as httpOnly cookies (ADR-0018). Routes are protected by default via a global `JwtAuthGuard` (`@Public()` opts a route out); request validation goes through a hand-rolled `ZodValidationPipe` rather than `class-validator` (ADR-0019). `StudentProfile.promotion` becomes nullable to match the already-approved two-step signup/profile-completion design (spec #9).
- `apps/web`: `/signup` and `/login` screens (MUI, ADR-0017 theme, `react-hook-form` + the shared Zod schemas), a guarded `/dashboard` placeholder route, and a 401-retry-once interceptor in the API client that transparently refreshes an expired access token instead of surfacing a logout.
