// A well-formed version 1 stage snapshot (ADR-0033), for tests that need a frozen stage.
export function snapshotV1(overrides: Record<string, unknown> = {}) {
  return {
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    service: "Cardiologie",
    projectType: "Handicap moteur",
    motivation: "Découvrir le milieu hospitalier",
    organism: {
      id: "org-1",
      name: "Hôpital Cochin",
      structureType: "Secteur Sanitaire",
      city: "Paris",
      postalCode: "75014",
      street: "27 Rue du Faubourg Saint-Jacques",
    },
    tutor: {
      id: "tut-1",
      firstName: "Marie",
      lastName: "Curie",
      email: "m.curie@example.org",
      jobTitle: "Médecin",
      phone: null,
      acceptsPhoneContact: false,
    },
    periods: [
      { id: "p1", startDate: "2025-10-01T00:00:00.000Z", endDate: "2025-10-15T00:00:00.000Z" },
    ],
    referent: { id: "ref-1", firstName: "Jean", lastName: "Valjean" },
    promotion: "L2",
    decidedAt: "2025-09-10T09:30:00.000Z",
    decidedBy: {
      id: "admin-1",
      firstName: "Alice",
      lastName: "Martin",
      title: "responsable de stages L2 et L3 APA-S",
    },
    ...overrides,
  };
}
