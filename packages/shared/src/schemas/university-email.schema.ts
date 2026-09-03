// STUDENT_EMAIL_DOMAIN is reused by signupSchema (must end with this domain)
// and updateProfileSchema (personalEmail must NOT end with this domain) —
// kept neutral here since neither schema owns the rule.
//
// No equivalent constant exists for ADMIN/REFERENT: personnel accounts are
// provisioned out-of-band by an operator, not validated against any
// institutional domain — see ADR-0025. Don't add one back on the assumption
// that a future personnel signup flow will need it; that's an open question,
// not a settled one.
export const STUDENT_EMAIL_DOMAIN = "@etu.u-paris.fr";
