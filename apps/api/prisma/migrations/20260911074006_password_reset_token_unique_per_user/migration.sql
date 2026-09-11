-- Enforce at most one live PasswordResetToken per account (BR-13, review
-- follow-up on PR #81): closes a race where two concurrent forgot-password
-- requests could otherwise both survive as separate live tokens.
-- forgotPassword() now upserts on this key instead of delete-then-create.
DROP INDEX "PasswordResetToken_userId_idx";

CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");
