-- Issue #66: latest refusal reason only, no history. Same nullable shape as
-- the existing (unused) Stage.refusalReason column.
ALTER TABLE "StudentProfile" ADD COLUMN "refusalReason" TEXT;
