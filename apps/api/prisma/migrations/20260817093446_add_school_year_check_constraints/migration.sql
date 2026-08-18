-- ADR-0012: defense-in-depth format check for `schoolYear`. The single
-- source of truth for the "YYYY-YYYY, second year = first + 1" rule is the
-- shared Zod value-object in packages/shared — this CHECK only guards the
-- "^\d{4}-\d{4}$" format, never the N+1 semantic rule.

ALTER TABLE "Stage" ADD CONSTRAINT stage_school_year_format
  CHECK ("schoolYear" ~ '^\d{4}-\d{4}$');

ALTER TABLE "ReferentAssignment" ADD CONSTRAINT referent_assignment_school_year_format
  CHECK ("schoolYear" ~ '^\d{4}-\d{4}$');

ALTER TABLE "StudentProfile" ADD CONSTRAINT student_profile_profile_year_format
  CHECK ("profileYear" IS NULL OR "profileYear" ~ '^\d{4}-\d{4}$');
