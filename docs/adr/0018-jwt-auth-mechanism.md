# ADR-0018 — JWT auth: access + refresh via httpOnly cookies, global guard by default

- Status: Accepted
- Date: 2026-08-21
- Deciders: project owner

## Context

Issue #10 (student signup & login) is the first ticket to need an actual authentication mechanism — nothing prior picked a JWT strategy, a token transport, a session lifetime, or a guard-wiring convention, even though `.env.example` already reserved `JWT_SECRET`/`JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` and `apps/web/src/lib/api-client.ts` already sent `credentials: "include"` on every request — both signals that cookie-based tokens were anticipated from the start. This is a genuine "auth mechanism" decision per `CLAUDE.md` §4 (a concurrency/auth-shaped choice with lasting consequences for every subsequent ticket), so it gets its own ADR rather than being decided silently inside issue #10's implementation.

Two nested questions had to be settled together, since they trade off against each other:

1. **Token transport.** A bearer token in the response body (kept in memory or `localStorage`) vs. an httpOnly cookie. `localStorage` is readable by any script on the page — any XSS vulnerability anywhere in the app hands over the token directly. An httpOnly cookie is never exposed to JS at all, at the cost of needing explicit CSRF consideration (mitigated here with `sameSite: "lax"`, appropriate for a same-origin SPA) and a `credentials: "include"`/CORS `credentials: true` pairing on every request — which `api-client.ts` already does.
2. **Session lifetime model.** A single long-lived access token is simple but means either a long exposure window if the token leaks, or frequent forced re-logins if kept short. A short-lived access token (15 min) paired with a longer-lived refresh token (7 days) bounds the exposure window on the access token without forcing a student to re-authenticate mid-task (e.g. filling out a long stage-submission form) — as long as the refresh happens transparently. The tradeoff is the added moving part: refresh tokens must be persisted server-side (to be revocable — a bare JWT refresh token could not be invalidated on logout) and rotated on use.

A further fork inside the refresh-token design: a **single active session per user** (one `refreshTokenHash` column on `User`, a new login silently invalidates the previous one) vs. **multiple concurrent sessions** (a `RefreshToken` table, one row per login). Given students realistically use both a phone and a laptop, single-session was rejected as a real-world usability regression for a fairly small implementation cost difference (one small table vs. one column).

## Decision

- **`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`** for signing/verifying the short-lived access JWT (`sub`, `email`, `roles`); **`bcrypt`** for password hashing.
- **Both tokens travel as httpOnly cookies**, not in the response body: `access_token` (path `/`, `maxAge` = `JWT_ACCESS_TTL` = 15 min) and `refresh_token` (path `/auth`, scoped so it's only ever sent to `/auth/refresh`/`/auth/logout`, `maxAge` = `JWT_REFRESH_TTL` = 7 days). Both `sameSite: "lax"`, `secure` in production.
- **Access + refresh, not access-only.** The refresh token is a high-entropy random value (`crypto.randomBytes(32)`), never a JWT itself — only its SHA-256 hash is persisted in a new `RefreshToken` table (see `docs/dataModel.md`). SHA-256, not `bcrypt`, because the refresh token is already high-entropy; `bcrypt`'s deliberately slow hashing exists to resist brute-forcing a low-entropy guessable secret (a password), which doesn't apply here and would just add latency.
- **Multi-session**: one `RefreshToken` row per login (`userId`, `tokenHash`, `expiresAt`). Logging in on a second device does not invalidate the first. Logout deletes only the row matching the presented refresh token, revoking that one session.
- **Rotation on use**: `POST /auth/refresh` deletes the matched row and issues a new access token + new refresh token (new row) in the same transaction. A stolen-then-replayed old refresh token fails outright once it's been rotated away — a reasonable baseline without building full token-family reuse detection.
- **Guards are global-default-protected**: `JwtAuthGuard` is registered as `APP_GUARD` in `AppModule`, so every route requires a valid `access_token` cookie unless explicitly marked `@Public()`. Only `/auth/signup`, `/auth/login`, `/auth/refresh`, and `/auth/logout` are `@Public()`. This is safer by construction than per-route opt-in: issue #10 is explicitly "the auth foundation every other student screen sits behind" (#11-#14 add many more endpoints), and a global default means a future ticket can't accidentally ship an unguarded route by forgetting a decorator.
- `RolesGuard` + `@Roles(...)` (per `CLAUDE.md` §5, "at least one of" semantics) are scaffolded now even though no route in this ticket uses them yet, since the issue explicitly calls for guards to be wired.

## Consequences

- The frontend needs a 401-retry-once interceptor (`apps/web/src/lib/api-client.ts`) that transparently calls `/auth/refresh` and retries the original request when the access token has expired, with concurrent 401s deduplicated to a single in-flight refresh call. Without this, the short 15-minute access token would otherwise surface as unexpected logouts mid-session.
- `POST /auth/logout` must remain `@Public()` (not gated behind a valid access token) — a user with an already-expired access token still needs to be able to log out, using only the refresh cookie to identify which session to revoke.
- A new `RefreshToken` table (see `docs/dataModel.md`) and its migration are part of issue #10, not deferred to a later ticket.
- No refresh-token-family reuse detection (e.g. invalidating _all_ of a user's sessions when a rotated-away token is replayed) — accepted as out of scope for V1; plain rotation-without-family-tracking is the documented baseline here and can be revisited later if warranted.

## Alternatives considered

- **Bearer token in the response body, `localStorage`.** Simplest SPA pattern, rejected: any XSS vulnerability anywhere in the app becomes a full session-theft vector.
- **Bearer token in memory only, short-lived, no refresh.** Most CSRF-resistant option, rejected: the user is logged out on every page reload/tab close, which is a real UX regression without a refresh flow to smooth it over — and a refresh flow was already being built anyway.
- **Access-token-only (no refresh), single 15-minute session.** Simpler (no `RefreshToken` table), initially adopted in an early draft of this ticket, then rejected: 15 minutes is short enough that a student mid-way through a long stage-submission form could be logged out before finishing.
- **Single-session refresh token (one column on `User`).** Simpler than a `RefreshToken` table, rejected in favor of multi-session: logging in on a second device silently logging out the first is a real usability regression for a student app used on both phone and laptop, for a small implementation-cost difference.
- **Per-route `@UseGuards(JwtAuthGuard)` opt-in.** More visible at each call site, rejected in favor of global-default-protected: relies on remembering to add the guard on every future route, which is exactly the kind of mistake a "foundation" ticket should make structurally impossible.
