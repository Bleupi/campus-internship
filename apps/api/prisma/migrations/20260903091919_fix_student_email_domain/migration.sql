-- Data correction for issue #54: PR #51 mistakenly applied a domain change
-- meant for university personnel (STAFF_EMAIL_DOMAIN, "@u-pariscite.fr") to
-- the STUDENT constant instead. Real student institutional domain is
-- "@etu.u-paris.fr". This targeted UPDATE corrects login emails for
-- existing STUDENT users that were created under the wrong domain.
--
-- Additive/reversible in shape only (never a truncate/reset), per the
-- project's non-negotiable rule against destructive production writes
-- (CLAUDE.md §10/§12). Not executed against production by the agent — a
-- human explicitly runs this against a live environment.

-- Case-insensitive: signupSchema only lower-cases for the domain check
-- (value.toLowerCase().endsWith(...)) but stores the email verbatim, so a
-- row written during the PR #51 window may have a mixed-case domain suffix.
UPDATE "User"
SET "email" = regexp_replace("email", '@u-pariscite\.fr$', '@etu.u-paris.fr', 'i')
WHERE 'STUDENT' = ANY("roles")
  AND "email" ~* '@u-pariscite\.fr$';
