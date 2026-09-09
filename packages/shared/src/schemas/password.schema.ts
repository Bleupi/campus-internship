import { z } from "zod";

// Length-only policy (NIST 800-63B: length beats forced complexity rules).
// max(72) matches bcrypt's hard input-byte limit — bcrypt silently
// truncates anything past that, so longer input wouldn't be fully checked.
// Single implementation (ADR-0012's principle, applied here for the first
// time to something other than schoolYear): reused by signupSchema and
// resetPasswordSchema so the two rules can never silently diverge.
export const passwordSchema = z.string().min(18).max(72);
