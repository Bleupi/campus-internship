---
"web": minor
---

Add the self-service password-reset UI (BR-13, issue #80): a "Mot de passe oublié ?" link on the login page, a forgot-password page (`/forgot-password`) that always shows the identical generic confirmation regardless of whether the email matched an account, and a reset-password page (`/reset-password?token=...`) that submits the new password against the token and redirects to `/login` with a success message on success — the user is never automatically logged in. An invalid/expired/used token shows one generic rejection message, indistinguishable across the three cases; a genuine network/server failure shows a distinct fallback instead of misleadingly claiming the link is bad. Both forms validate against the shared `forgotPasswordSchema`/`resetPasswordSchema` from `packages/shared` via `react-hook-form` + `@hookform/resolvers/zod`. Wires up the `POST /auth/forgot-password` and `POST /auth/reset-password` endpoints added in #79/#81.
