// BR-11's acting-admin naming convention, shared by every admin-triggered
// student notification (AdminStudentsService's profile validate/reject,
// AdminStageRequestsService's stage refuse) so the rule lives in exactly one
// place instead of drifting between call sites.

// TODO(#67 follow-up, see docs/ROADMAP_V2.md "Admin function/title as a
// field"): hardcoded because there is a single admin today. Move this to a
// real field on the acting admin before a second admin is onboarded, so we
// never silently email a student the wrong title.
export const ADMIN_TITLE = "responsable de stages L2 et L3 APA-S";

export interface ActingAdmin {
  firstName: string;
  lastName: string;
}

// BR-11: "NOM Prénom" — last name uppercased, first name as stored, space
// separated, no comma. Used identically in the body mention and the
// signature; only the body mention also carries ADMIN_TITLE.
export function adminDisplayName(admin: ActingAdmin): string {
  return `${admin.lastName.toUpperCase()} ${admin.firstName}`;
}

// Shared plain-text structure for every student-facing email: a
// personalized greeting, one or more body paragraphs (a refusal reason is
// just another paragraph — never the whole message on its own), and a
// signature. Kept here (not MailerService, which stays content-agnostic per
// ADR-0026) since deciding what a notification says is business logic, not
// transport.
export function composeStudentEmail(
  studentFirstName: string,
  signatureName: string,
  ...paragraphs: string[]
): string {
  return [`Bonjour ${studentFirstName},`, ...paragraphs, `Cordialement,\n${signatureName}`].join(
    "\n\n",
  );
}
