import { z } from "zod";

const BCRYPT_MAX_INPUT_BYTES = 72;

// Length-only policy (NIST 800-63B: length beats forced complexity rules).
// bcrypt's hard input limit is 72 *bytes*, not characters. A plain
// z.string().max(72) counts UTF-16 code units instead, so a password under
// 72 chars but over 72 UTF-8 bytes (multi-byte characters like é, è, à, ç,
// œ — plausible in this French-language app) would pass validation and then
// get silently truncated by bcrypt (review follow-up on PR #81). TextEncoder
// (not Buffer: this schema also runs in the browser, packages/shared stays
// runtime-agnostic per CLAUDE.md) gives the real UTF-8 byte count.
// Single implementation (ADR-0012's principle, applied here for the first
// time to something other than schoolYear): reused by signupSchema and
// resetPasswordSchema so the two rules can never silently diverge.
export const passwordSchema = z
  .string()
  .min(18)
  .refine((value) => new TextEncoder().encode(value).length <= BCRYPT_MAX_INPUT_BYTES, {
    message: `Le mot de passe ne doit pas dépasser ${BCRYPT_MAX_INPUT_BYTES} octets une fois encodé (les caractères accentués comptent pour plusieurs octets)`,
  });
