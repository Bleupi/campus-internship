// STUDENT_EMAIL_DOMAIN is reused by signupSchema (must end with this domain)
// and updateProfileSchema (personalEmail must NOT end with this domain) —
// kept neutral here since neither schema owns the rule.
export const STUDENT_EMAIL_DOMAIN = "@etu.u-paris.fr";

// STAFF_EMAIL_DOMAIN is the real institutional domain for ADMIN + REFERENT
// personnel. It is NOT yet consumed by any schema — no personnel
// signup/creation flow exists in the codebase (ADR-0001 defines the Role
// set; the only auth endpoint today is student POST /auth/signup). It's
// defined here so that future personnel-account-creation work doesn't have
// to rediscover or re-litigate this value.
export const STAFF_EMAIL_DOMAIN = "@u-pariscite.fr";
