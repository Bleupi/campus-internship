// PROTOTYPE — throwaway. Question: what should the admin's "stage requests to
// process" page look like? Fully in-memory stub data, no API calls.
// Delete this whole folder (and the route/nav entry) once a variant wins.
import type { Promotion, Semester } from "shared";

export interface MockReferent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface MockPreviousStage {
  promotion: "L1" | "L2" | "L3";
  schoolYear: string;
  semester: Semester;
  structureType: string;
  organism: string;
  service: string | null;
}

export type MockStageStatus = "PENDING" | "VALIDATED" | "REFUSED";

export interface MockStageRequest {
  id: string;
  status: MockStageStatus;
  version: number;
  // Simulates BR-09: the first decision on this request hits a stale version.
  staleOnce?: boolean;
  student: { id: string; firstName: string; lastName: string; promotion: Promotion; email: string };
  schoolYear: string;
  semester: Semester;
  mandatory: boolean;
  // Everything below is what the student typed in the wizard.
  organism: {
    name: string;
    structureType: string;
    street: string;
    postalCode: string;
    city: string;
  };
  service: string | null;
  projectType: string | null;
  motivation: string | null;
  tutor: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    email: string;
    phone: string | null;
    acceptsPhoneContact: boolean;
  };
  periods: { startDate: string; endDate: string }[];
  submittedAt: string;
  // The admin only sees the student's previous *mandatory* stages.
  previousMandatory: MockPreviousStage[];
  // Set when the student duplicated a refused request to resubmit it corrected (parentStageId).
  correctsRefused?: { date: string; reason: string };
  refusalReason?: string;
  // Frozen at validation/refusal (ADR-0003) — display source once decided.
  frozenReferent?: MockReferent | null;
}

export const SCHOOL_YEAR = "2026-2027";

export function assignmentKey(request: MockStageRequest): string {
  return `${request.student.id}|${request.schoolYear}|${request.semester}|${request.mandatory}`;
}

export function kindLabel(mandatory: boolean) {
  return mandatory ? "Obligatoire" : "Facultatif";
}

export function groupLabel(
  request: Pick<MockStageRequest, "schoolYear" | "semester" | "mandatory">,
) {
  return `${request.schoolYear} · ${request.semester} · ${kindLabel(request.mandatory).toLowerCase()}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

export function fmtPeriods(request: MockStageRequest) {
  return request.periods.map((p) => `${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`);
}

export function totalWeeks(request: MockStageRequest) {
  const days = request.periods.reduce(
    (sum, p) => sum + (Date.parse(p.endDate) - Date.parse(p.startDate)) / 86_400_000 + 1,
    0,
  );
  return Math.round((days / 7) * 10) / 10;
}

export function isAddressIncomplete(o: MockStageRequest["organism"]) {
  return !o.street.trim() || !o.postalCode.trim() || !o.city.trim();
}

export const SEED_REFERENTS: MockReferent[] = [
  { id: "ref-1", firstName: "Hélène", lastName: "Garnier", email: "h.garnier@example.org" },
  { id: "ref-2", firstName: "Marc", lastName: "Lefèvre", email: "m.lefevre@example.org" },
  { id: "ref-3", firstName: "Sophie", lastName: "Bernard", email: "sophie.bernard@example.org" },
  { id: "ref-4", firstName: "Karim", lastName: "Chevalier", email: "karim.chevalier@example.org" },
  { id: "ref-5", firstName: "Nathalie", lastName: "Dubois", email: "nathalie.dubois@example.org" },
  { id: "ref-6", firstName: "Olivier", lastName: "Faure", email: "olivier.faure@example.org" },
  { id: "ref-7", firstName: "Isabelle", lastName: "Guerin", email: "isabelle.guerin@example.org" },
  { id: "ref-8", firstName: "Julien", lastName: "Lambert", email: "julien.lambert@example.org" },
  { id: "ref-9", firstName: "Céline", lastName: "Marchand", email: "celine.marchand@example.org" },
  { id: "ref-10", firstName: "Antoine", lastName: "Nguyen", email: "antoine.nguyen@example.org" },
  { id: "ref-11", firstName: "Valérie", lastName: "Perrin", email: "valerie.perrin@example.org" },
  { id: "ref-12", firstName: "Thierry", lastName: "Robin", email: "thierry.robin@example.org" },
  { id: "ref-13", firstName: "Amélie", lastName: "Schmitt", email: "amelie.schmitt@example.org" },
  { id: "ref-14", firstName: "David", lastName: "Vasseur", email: "david.vasseur@example.org" },
];

// Keys are assignmentKey() — ADR-0014's four-tuple.
export const SEED_ASSIGNMENTS: Record<string, string> = {
  "stu-4|2026-2027|S1|true": "ref-1", // Léa — ready
  "stu-1|2026-2027|S1|false": "ref-2", // Camille — optional stage only
  "stu-7|2026-2027|S1|true": "ref-2", // Thomas — ready (but stale)
  "stu-10|2026-2027|S2|true": "ref-1", // Emma — ready
};

const email = (first: string, last: string) => `${first}.${last}@etu.example.org`.toLowerCase();
const student = (id: string, firstName: string, lastName: string, promotion: Promotion) => ({
  id,
  firstName,
  lastName,
  promotion,
  email: email(firstName, lastName).normalize("NFD").replace(/[̀-ͯ]/g, ""),
});
const prev = (
  promotion: MockPreviousStage["promotion"],
  schoolYear: string,
  semester: Semester,
  structureType: string,
  organism: string,
  service: string | null,
): MockPreviousStage => ({ promotion, schoolYear, semester, structureType, organism, service });
const period = (startDate: string, endDate: string) => ({
  startDate: `${startDate}T00:00:00Z`,
  endDate: `${endDate}T00:00:00Z`,
});

export const SEED_REQUESTS: MockStageRequest[] = [
  {
    id: "r1",
    status: "PENDING",
    version: 3,
    student: student("stu-1", "Camille", "Martin", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Centre de rééducation Les Tilleuls",
      structureType: "Établissement de santé privé",
      street: "12 rue des Tilleuls",
      postalCode: "75013",
      city: "Paris",
    },
    service: "Pôle réadaptation cardiaque",
    projectType: "Animation d'ateliers d'activité physique adaptée",
    motivation:
      "Je souhaite découvrir la prise en charge des patients cardiaques en APA. J'aimerais concevoir et animer des séances collectives adaptées, et comprendre comment l'équipe pluridisciplinaire construit un programme individualisé. Ce stage s'inscrit dans mon projet de poursuivre en master APA-S.",
    tutor: {
      firstName: "Claire",
      lastName: "Bonnet",
      jobTitle: "Enseignante en APA",
      email: "c.bonnet@tilleuls.example",
      phone: "01 45 00 11 22",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-10-05", "2026-10-30"), period("2026-11-16", "2026-11-27")],
    submittedAt: "2026-09-14T09:12:00Z",
    previousMandatory: [
      prev("L2", "2025-2026", "S1", "Association", "Sport Santé Paris", "Pôle seniors"),
    ],
  },
  {
    id: "r2",
    status: "PENDING",
    version: 1,
    student: student("stu-1", "Camille", "Martin", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: false,
    organism: {
      name: "Association Sport Santé Paris",
      structureType: "Association",
      street: "4 avenue Jean Jaurès",
      postalCode: "75019",
      city: "Paris",
    },
    service: "Pôle seniors",
    projectType: "Prévention des chutes",
    motivation:
      "Compléter ma formation avec un stage supplémentaire auprès du public senior, que j'ai découvert l'an dernier.",
    tutor: {
      firstName: "Yves",
      lastName: "Renaud",
      jobTitle: "Éducateur sportif",
      email: "y.renaud@ssp.example",
      phone: null,
      acceptsPhoneContact: false,
    },
    periods: [period("2026-12-01", "2026-12-12")],
    submittedAt: "2026-09-14T09:30:00Z",
    previousMandatory: [
      prev("L2", "2025-2026", "S1", "Association", "Sport Santé Paris", "Pôle seniors"),
    ],
  },
  {
    id: "r3",
    status: "PENDING",
    version: 2,
    student: student("stu-3", "Yanis", "Benali", "L2"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "EHPAD Les Lilas",
      structureType: "Établissement médico-social",
      street: "8 rue du Général Leclerc",
      postalCode: "93260",
      city: "Les Lilas",
    },
    service: "Animation",
    projectType: "Ateliers de motricité",
    motivation:
      "Première expérience auprès de personnes âgées dépendantes. Je veux voir concrètement comment on adapte une activité physique à des capacités très variables.",
    tutor: {
      firstName: "Sarah",
      lastName: "Cohen",
      jobTitle: "Animatrice",
      email: "s.cohen@leslilas.example",
      phone: "06 12 34 56 78",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-11-02", "2026-11-27")],
    submittedAt: "2026-09-15T14:02:00Z",
    correctsRefused: {
      date: "2026-09-08T10:15:00Z",
      reason: "- L'adresse de l'organisme est incomplète.",
    },
    previousMandatory: [],
  },
  {
    id: "r4",
    status: "PENDING",
    version: 1,
    student: student("stu-4", "Léa", "Dupont", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Institut médico-éducatif Arc-en-ciel",
      structureType: "Établissement médico-social",
      street: "27 boulevard Gambetta",
      postalCode: "93100",
      city: "Montreuil",
    },
    service: "Section adolescents",
    projectType: "Séances d'APA pour adolescents en situation de handicap",
    motivation:
      "J'ai fait du bénévolat en handisport et je veux professionnaliser mon approche. Je souhaite observer puis co-animer des séances, et participer à l'évaluation des progrès moteurs des jeunes.",
    tutor: {
      firstName: "Amadou",
      lastName: "Diallo",
      jobTitle: "Enseignant en APA",
      email: "a.diallo@arcenciel.example",
      phone: "01 48 00 33 44",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-10-12", "2026-11-06")],
    submittedAt: "2026-09-15T16:45:00Z",
    previousMandatory: [prev("L2", "2025-2026", "S2", "Entreprise privée", "Neoness", "Coaching")],
  },
  {
    id: "r5",
    status: "PENDING",
    version: 1,
    student: student("stu-5", "Hugo", "Petit", "L2"),
    schoolYear: SCHOOL_YEAR,
    semester: "S2",
    mandatory: true,
    // Incomplete on purpose: street & postal code missing, no motivation.
    organism: {
      name: "Clinique du Parc",
      structureType: "Établissement de santé privé",
      street: "",
      postalCode: "",
      city: "Lyon",
    },
    service: null,
    projectType: "Réhabilitation post-opératoire",
    motivation: null,
    tutor: {
      firstName: "Nadia",
      lastName: "Haddad",
      jobTitle: "Kinésithérapeute",
      email: "n.haddad@cliniqueduparc.example",
      phone: null,
      acceptsPhoneContact: false,
    },
    periods: [period("2027-03-01", "2027-03-26")],
    submittedAt: "2026-09-16T08:20:00Z",
    previousMandatory: [],
  },
  {
    id: "r6",
    status: "PENDING",
    version: 1,
    student: student("stu-6", "Sofia", "Rossi", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: false,
    organism: {
      name: "Club de gymnastique de Montreuil",
      structureType: "Association sportive",
      street: "3 rue Robespierre",
      postalCode: "93100",
      city: "Montreuil",
    },
    service: null,
    projectType: "Gym adaptée",
    motivation:
      "Je veux mettre en pratique mes acquis en gymnastique auprès d'un public sédentaire.",
    tutor: {
      firstName: "Paul",
      lastName: "Vidal",
      jobTitle: "Entraîneur",
      email: "p.vidal@gymmontreuil.example",
      phone: "06 98 76 54 32",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-12-07", "2026-12-18")],
    submittedAt: "2026-09-16T11:05:00Z",
    previousMandatory: [prev("L2", "2025-2026", "S1", "Association", "Simplon", "Formation")],
  },
  {
    id: "r7",
    status: "PENDING",
    version: 4,
    staleOnce: true,
    student: student("stu-7", "Thomas", "Leroy", "L2"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Hôpital Bichat — Claude Bernard",
      structureType: "Établissement public de santé",
      street: "46 rue Henri Huchard",
      postalCode: "75018",
      city: "Paris",
    },
    service: "Médecine physique et de réadaptation",
    projectType: "Réentraînement à l'effort",
    motivation:
      "Attiré par la réadaptation respiratoire et cardiaque. Je souhaite comprendre le rôle de l'enseignant en APA dans un service hospitalier.",
    tutor: {
      firstName: "Julie",
      lastName: "Faure",
      jobTitle: "Enseignante en APA",
      email: "j.faure@bichat.example",
      phone: "01 40 25 80 00",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-10-19", "2026-11-13")],
    submittedAt: "2026-09-17T10:00:00Z",
    previousMandatory: [],
  },
  {
    id: "r8",
    status: "PENDING",
    version: 1,
    student: student("stu-8", "Inès", "Moreau", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Fondation Santé & Mouvement",
      structureType: "Fondation",
      street: "15 rue de la Roquette",
      postalCode: "75011",
      city: "Paris",
    },
    service: "Programme diabète",
    projectType: "Éducation thérapeutique",
    motivation:
      "Je m'intéresse aux maladies chroniques et à l'éducation thérapeutique. Trois périodes sont prévues pour suivre un cycle complet de patients, de l'évaluation initiale au bilan.",
    tutor: {
      firstName: "Laurent",
      lastName: "Meyer",
      jobTitle: "Enseignant en APA",
      email: "l.meyer@sante-mouvement.example",
      phone: "01 43 00 55 66",
      acceptsPhoneContact: false,
    },
    periods: [
      period("2026-10-05", "2026-10-16"),
      period("2026-11-02", "2026-11-13"),
      period("2026-12-07", "2026-12-11"),
    ],
    submittedAt: "2026-09-17T15:40:00Z",
    previousMandatory: [
      prev("L2", "2025-2026", "S1", "Entreprise privée", "Fitness Park", "Coaching"),
      prev("L2", "2025-2026", "S2", "Association", "Restos du Cœur", null),
    ],
  },
  {
    id: "r9",
    status: "PENDING",
    version: 1,
    student: student("stu-9", "Noah", "Garcia", "L2"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Salle Cardio Plus",
      structureType: "Entreprise privée",
      street: "90 avenue de Flandre",
      postalCode: "75019",
      city: "Paris",
    },
    service: "Coaching",
    projectType: "Remise en forme",
    motivation:
      "Expérience de coaching en salle. Le projet est décrit en deux versions ci-dessous car j'hésite entre suivi individuel et cours collectifs.",
    tutor: {
      firstName: "Élise",
      lastName: "Roux",
      jobTitle: "Coach sportif",
      email: "e.roux@cardioplus.example",
      phone: "06 11 22 33 44",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-11-02", "2026-11-27")],
    submittedAt: "2026-09-18T09:00:00Z",
    previousMandatory: [],
  },
  {
    // Same student, same (year, semester, mandatory) as r9: shares its referent.
    id: "r12",
    status: "PENDING",
    version: 1,
    student: student("stu-9", "Noah", "Garcia", "L2"),
    schoolYear: SCHOOL_YEAR,
    semester: "S1",
    mandatory: true,
    organism: {
      name: "Piscine municipale de Pantin",
      structureType: "Collectivité territoriale",
      street: "2 rue de la Liberté",
      postalCode: "93500",
      city: "Pantin",
    },
    service: "Aquagym",
    projectType: "Encadrement d'aquagym seniors",
    motivation:
      "Seconde option de stage pour la même période, au cas où le premier projet ne serait pas retenu.",
    tutor: {
      firstName: "Marie",
      lastName: "Colin",
      jobTitle: "Maître-nageur",
      email: "m.colin@pantin.example",
      phone: "06 55 44 33 22",
      acceptsPhoneContact: true,
    },
    periods: [period("2026-11-02", "2026-11-27")],
    submittedAt: "2026-09-18T09:20:00Z",
    previousMandatory: [],
  },
  {
    id: "r10",
    status: "PENDING",
    version: 1,
    student: student("stu-10", "Emma", "Fontaine", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S2",
    mandatory: true,
    organism: {
      name: "Maison de santé de Vincennes",
      structureType: "Structure de santé de proximité",
      street: "22 rue de Montreuil",
      postalCode: "94300",
      city: "Vincennes",
    },
    service: "Sport-santé",
    projectType: "Parcours patient sport-santé",
    motivation:
      "Mon projet professionnel est de travailler en maison de santé pluriprofessionnelle. Je veux participer à la prescription d'activité physique et au suivi des patients.",
    tutor: {
      firstName: "Hervé",
      lastName: "Lambert",
      jobTitle: "Enseignant en APA",
      email: "h.lambert@msvincennes.example",
      phone: "01 43 28 00 00",
      acceptsPhoneContact: true,
    },
    periods: [period("2027-02-08", "2027-03-05")],
    submittedAt: "2026-09-19T13:30:00Z",
    previousMandatory: [prev("L2", "2025-2026", "S2", "Entreprise privée", "Neoness", "Coaching")],
  },
  {
    // The case asked for: an L3 with an S2 request, two mandatory stages in L2
    // and one mandatory stage in S1 of L3 (validated earlier this year).
    id: "r11",
    status: "PENDING",
    version: 1,
    student: student("stu-11", "Manon", "Girard", "L3"),
    schoolYear: SCHOOL_YEAR,
    semester: "S2",
    mandatory: false,
    organism: {
      name: "Association Handi Sport 93",
      structureType: "Association",
      street: "6 rue Jules Guesde",
      postalCode: "93200",
      city: "Saint-Denis",
    },
    service: "Pôle jeunesse",
    projectType: "Initiation multisports",
    motivation:
      "Après mes trois stages obligatoires (deux en L2, un au premier semestre de L3), je souhaite un stage facultatif pour approfondir l'encadrement de jeunes en situation de handicap, qui est le cœur de mon projet de master.",
    tutor: {
      firstName: "Karim",
      lastName: "Amrani",
      jobTitle: "Enseignant en APA",
      email: "k.amrani@handisport93.example",
      phone: "01 49 00 12 34",
      acceptsPhoneContact: true,
    },
    periods: [period("2027-02-15", "2027-03-12"), period("2027-04-12", "2027-04-23")],
    submittedAt: "2026-09-20T08:10:00Z",
    previousMandatory: [
      prev("L2", "2025-2026", "S1", "Association", "Sport Santé Paris", "Pôle seniors"),
      prev(
        "L2",
        "2025-2026",
        "S2",
        "Établissement médico-social",
        "IME Les Cèdres",
        "Section enfants",
      ),
      prev(
        "L3",
        "2026-2027",
        "S1",
        "Établissement de santé privé",
        "Centre de rééducation Les Tilleuls",
        "Réadaptation neurologique",
      ),
    ],
  },
];
