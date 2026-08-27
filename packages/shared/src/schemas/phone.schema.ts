import { z } from "zod";

// French mobile numbers only (06/07 — landline 01-05/08/09 rejected), in
// national or +33/0033-international form, with the usual space/dot/dash
// separators between digit pairs. The French numbering plan (ARCEP) is
// fixed-length and stable enough that a regex is reliable here — a full
// library (e.g. libphonenumber-js) earns its weight for multi-country
// support or E.164 normalization, neither of which this single-locale app
// needs (same reasoning as "no i18n library in V1").
const FRENCH_MOBILE_PHONE_REGEX = /^(?:(?:\+33|0033)\s?|0)[67](?:[\s.-]?\d{2}){4}$/;

export const frenchMobilePhoneSchema = z
  .string()
  .trim()
  .regex(FRENCH_MOBILE_PHONE_REGEX, "Le numéro doit être un numéro de mobile français valide");
