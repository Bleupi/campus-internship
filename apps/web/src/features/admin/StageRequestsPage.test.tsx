import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageRequestsPage } from "./StageRequestsPage";

const getStageRequestsMock = vi.fn();
const getStageRequestDetailMock = vi.fn();
const getStructureTypesMock = vi.fn();

vi.mock("./api", () => ({
  getStageRequests: (...args: unknown[]) => getStageRequestsMock(...args),
  getStageRequestDetail: (...args: unknown[]) => getStageRequestDetailMock(...args),
}));

vi.mock("../organisms/api", () => ({
  getStructureTypes: (...args: unknown[]) => getStructureTypesMock(...args),
}));

// The five configured types, alphabetical like GET /organisms/structure-types.
const STRUCTURE_TYPES = [
  "Secteur Associatif",
  "Secteur Fédéral",
  "Secteur Libéral",
  "Secteur Médico-social",
  "Secteur Sanitaire",
].map((label) => ({ id: label, label }));

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage-1",
    version: 0,
    schoolYear: "2026-2027",
    semester: "S1",
    mandatory: true,
    service: "Service de cardiologie",
    submittedAt: "2026-09-01T10:00:00.000Z",
    student: { id: "student-1", firstName: "Alice", lastName: "Martin", promotion: "L3" },
    organism: { name: "Hôpital Cochin", structureType: "Secteur Sanitaire" },
    firstPeriod: {
      id: "period-1",
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-10-31T00:00:00.000Z",
    },
    periodCount: 1,
    referent: null,
    ...overrides,
  };
}

const referent = { id: "ref-1", firstName: "Claire", lastName: "Bernard" };

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage-1",
    version: 0,
    schoolYear: "2026-2027",
    semester: "S1",
    mandatory: true,
    service: "Service de cardiologie",
    projectType: "Handicap moteur",
    motivation: "Une motivation détaillée.",
    submittedAt: "2026-09-01T10:00:00.000Z",
    student: {
      id: "student-1",
      firstName: "Alice",
      lastName: "Martin",
      email: "alice.martin@etu.u-paris.fr",
      promotion: "L3",
    },
    organism: {
      name: "Hôpital Cochin",
      structureType: "Secteur Sanitaire",
      street: "27 rue du Faubourg Saint-Jacques",
      postalCode: "75014",
      city: "Paris",
    },
    tutor: {
      firstName: "Marie",
      lastName: "Curie",
      email: "m.curie@example.org",
      jobTitle: "Médecin",
      phone: "0102030405",
      acceptsPhoneContact: true,
    },
    periods: [
      {
        id: "period-1",
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-05T00:00:00.000Z",
      },
    ],
    referent: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StageRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function bodyRows() {
  return screen.getAllByRole("row").slice(1);
}

describe("StageRequestsPage — issue #146", () => {
  beforeEach(() => {
    getStageRequestsMock.mockReset();
    getStageRequestDetailMock.mockReset();
    getStructureTypesMock.mockReset();
    getStructureTypesMock.mockResolvedValue(STRUCTURE_TYPES);
  });

  it("BR-03: renders the requests in the order the API returned them (already oldest submission first)", async () => {
    getStageRequestsMock.mockResolvedValue([
      request({
        id: "a",
        student: { id: "s1", firstName: "Alice", lastName: "Martin", promotion: "L3" },
      }),
      request({
        id: "b",
        student: { id: "s2", firstName: "Bob", lastName: "Durand", promotion: "M1" },
      }),
    ]);
    renderPage();

    await screen.findByText("Alice Martin");
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("Alice Martin");
    expect(rows[1]).toHaveTextContent("Bob Durand");
  });

  it("each row shows student, promotion, organism, service, first period (and how many more), semester, kind and referent", async () => {
    getStageRequestsMock.mockResolvedValue([
      request({
        periodCount: 3,
        semester: "S2",
        mandatory: false,
        referent,
      }),
    ]);
    renderPage();

    const row = (await screen.findByText("Alice Martin")).closest("tr")!;
    expect(row).toHaveTextContent("L3");
    expect(row).toHaveTextContent("Hôpital Cochin");
    expect(row).toHaveTextContent("Secteur Sanitaire");
    expect(row).toHaveTextContent("Service de cardiologie");
    expect(row).toHaveTextContent("01/10/2026 → 31/10/2026 (+2)");
    expect(row).toHaveTextContent("S2");
    expect(row).toHaveTextContent("Facultatif");
    expect(row).toHaveTextContent("Claire Bernard");
  });

  it("ADR-0014: marks a mandatory stage 'Obligatoire' and a request without referent as not yet assigned", async () => {
    getStageRequestsMock.mockResolvedValue([request({ mandatory: true, referent: null })]);
    renderPage();

    const row = (await screen.findByText("Alice Martin")).closest("tr")!;
    expect(row).toHaveTextContent("Obligatoire");
    expect(row).toHaveTextContent("Aucun référent");
  });

  it("shows the structure type as a coloured label: same type, same colour, and every configured type gets its own colour", async () => {
    getStageRequestsMock.mockResolvedValue([
      request({ id: "a", organism: { name: "Cochin", structureType: "Secteur Sanitaire" } }),
      request({ id: "b", organism: { name: "Bichat", structureType: "Secteur Sanitaire" } }),
      ...STRUCTURE_TYPES.map(({ label }, index) =>
        request({
          id: `t${index}`,
          organism: { name: `Organisme ${index}`, structureType: label },
        }),
      ),
    ]);
    renderPage();

    await screen.findByText("Cochin");
    await waitFor(() => {
      const label = within(bodyRows()[0]!).getByTestId("structure-type-label");
      expect(getComputedStyle(label).backgroundColor).not.toBe("");
    });
    const colours = bodyRows().map(
      (row) => getComputedStyle(within(row).getByTestId("structure-type-label")).backgroundColor,
    );
    const [first, second, ...perType] = colours;
    expect(second).toBe(first);
    expect(new Set(perType).size).toBe(STRUCTURE_TYPES.length);
  });

  it("still colours an organism whose structure type is no longer configured", async () => {
    getStageRequestsMock.mockResolvedValue([
      request({ organism: { name: "Cochin", structureType: "Ancien type supprimé" } }),
    ]);
    renderPage();

    const label = await screen.findByTestId("structure-type-label");
    await waitFor(() => expect(getComputedStyle(label).backgroundColor).not.toBe(""));
    expect(label).toHaveTextContent("Ancien type supprimé");
  });

  it("BR-03: tabs Toutes / Sans référent / Prêtes à valider show their counts and filter the rows", async () => {
    const user = userEvent.setup();
    getStageRequestsMock.mockResolvedValue([
      request({
        id: "a",
        student: { id: "s1", firstName: "Alice", lastName: "Martin", promotion: "L3" },
        referent,
      }),
      request({
        id: "b",
        student: { id: "s2", firstName: "Bob", lastName: "Durand", promotion: "L3" },
        referent: null,
      }),
      request({
        id: "c",
        student: { id: "s3", firstName: "Chloé", lastName: "Petit", promotion: "L3" },
        referent,
      }),
    ]);
    renderPage();

    expect(await screen.findByRole("tab", { name: /toutes.*3/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sans référent.*1/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prêtes à valider.*2/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /sans référent/i }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Bob Durand")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /prêtes à valider/i }));
    expect(bodyRows()).toHaveLength(2);
    expect(screen.queryByText("Bob Durand")).toBeNull();

    await user.click(screen.getByRole("tab", { name: /toutes/i }));
    expect(bodyRows()).toHaveLength(3);
  });

  it("the search filters by student name or organism name, ignoring case and accents", async () => {
    const user = userEvent.setup();
    getStageRequestsMock.mockResolvedValue([
      request({
        id: "a",
        student: { id: "s1", firstName: "Inès", lastName: "Martin", promotion: "L3" },
        organism: { name: "Hôpital Cochin", structureType: "Secteur Sanitaire" },
      }),
      request({
        id: "b",
        student: { id: "s2", firstName: "Bob", lastName: "Durand", promotion: "L3" },
        organism: { name: "Association Sportive", structureType: "Association" },
      }),
    ]);
    renderPage();
    await screen.findByText("Inès Martin");

    const search = screen.getByRole("searchbox", { name: /rechercher/i });
    await user.type(search, "ines");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Inès Martin")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "sportive");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Bob Durand")).toBeInTheDocument();
  });

  it("the search applies within the active tab and the counts stay those of the whole list", async () => {
    const user = userEvent.setup();
    getStageRequestsMock.mockResolvedValue([
      request({
        id: "a",
        student: { id: "s1", firstName: "Alice", lastName: "Martin", promotion: "L3" },
        referent,
      }),
      request({
        id: "b",
        student: { id: "s2", firstName: "Alice", lastName: "Durand", promotion: "L3" },
        referent: null,
      }),
    ]);
    renderPage();
    await screen.findByText("Alice Martin");

    await user.click(screen.getByRole("tab", { name: /sans référent/i }));
    await user.type(screen.getByRole("searchbox", { name: /rechercher/i }), "martin");

    expect(screen.getByText(/aucune demande ne correspond/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /toutes.*2/i })).toBeInTheDocument();
  });

  it("shows a clear empty state when nothing is left to process", async () => {
    getStageRequestsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/aucune demande à traiter/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows an error message when the list cannot be loaded", async () => {
    getStageRequestsMock.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de charger/i);
  });

  describe("row-expand detail — issue #147", () => {
    it("clicking a row expands a three-column detail with everything the student provided, and clicking again collapses it", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([
        request({
          id: "stage-1",
          organism: { name: "Association Sportive", structureType: "Secteur Sanitaire" },
          service: "Service triage",
        }),
      ]);
      getStageRequestDetailMock.mockResolvedValue(detail());
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(row);

      expect(getStageRequestDetailMock).toHaveBeenCalledWith("stage-1");
      expect(await screen.findByText("Hôpital Cochin")).toBeInTheDocument();
      // "Alice Martin" now appears twice: the row itself, and the detail's
      // own "Étudiant" section.
      expect(screen.getAllByText("Alice Martin")).toHaveLength(2);
      expect(screen.getByText("alice.martin@etu.u-paris.fr")).toBeInTheDocument();
      expect(screen.getByText("Obligatoire · S1 · soumise le 01/09/2026")).toBeInTheDocument();
      expect(screen.getByText("27 rue du Faubourg Saint-Jacques, 75014 Paris")).toBeInTheDocument();
      expect(screen.getByText("Service de cardiologie")).toBeInTheDocument();
      expect(screen.getByText("Handicap moteur")).toBeInTheDocument();
      expect(screen.getByText("Une motivation détaillée.")).toBeInTheDocument();
      expect(screen.getByText(/Marie Curie \(Médecin\)/)).toBeInTheDocument();
      expect(screen.getByText("m.curie@example.org")).toBeInTheDocument();
      expect(screen.getByText("0102030405")).toBeInTheDocument();
      expect(screen.getByText("Accepte d'être contacté par téléphone")).toBeInTheDocument();
      expect(screen.getByText("01/10/2026 → 05/10/2026")).toBeInTheDocument();
      expect(screen.getByText("Périodes (5 jours au total)")).toBeInTheDocument();

      await user.click(row);
      await waitFor(() => expect(screen.queryByText("Hôpital Cochin")).toBeNull());
    });

    // BR-02 requires service/project type/motivation non-blank to submit, and
    // the organism address is always complete (only ever written through the
    // wizard's Zod-validated create/edit paths) — the only value a student
    // may legitimately omit here is the tutor's phone, and with no phone
    // contact is impossible anyway, so both lines are hidden rather than
    // showing a hollow "Non renseigné" next to "ne souhaite pas être
    // contacté par téléphone".
    it("hides the phone and phone-contact lines when the tutor has no phone on file", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([
        request({
          id: "stage-1",
          organism: { name: "Association Sportive", structureType: "Secteur Sanitaire" },
        }),
      ]);
      getStageRequestDetailMock.mockResolvedValue(
        detail({
          tutor: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: null,
            acceptsPhoneContact: false,
          },
        }),
      );
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(row);

      await screen.findByText("Hôpital Cochin");
      expect(screen.queryByText("Non renseigné")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Ne souhaite pas être contacté par téléphone"),
      ).not.toBeInTheDocument();
    });

    // Regression: `acceptsPhoneContact` is settable independently of `phone`
    // (OrganismTutorForms.tsx has no cross-field constraint), so a tutor can
    // legitimately have phone: null with acceptsPhoneContact: true — the
    // phone-contact section must still hide, not show a hollow "Non renseigné"
    // next to "Accepte d'être contacté par téléphone".
    it("hides the phone and phone-contact lines even when acceptsPhoneContact is true but no phone is on file", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([
        request({
          id: "stage-1",
          organism: { name: "Association Sportive", structureType: "Secteur Sanitaire" },
        }),
      ]);
      getStageRequestDetailMock.mockResolvedValue(
        detail({
          tutor: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: null,
            acceptsPhoneContact: true,
          },
        }),
      );
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(row);

      await screen.findByText("Hôpital Cochin");
      expect(screen.queryByText("Non renseigné")).not.toBeInTheDocument();
      expect(screen.queryByText("Accepte d'être contacté par téléphone")).not.toBeInTheDocument();
    });

    it("shows an error message when the detail cannot be loaded", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([
        request({
          id: "stage-1",
          organism: { name: "Association Sportive", structureType: "Secteur Sanitaire" },
        }),
      ]);
      getStageRequestDetailMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(row);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /impossible de charger le détail/i,
      );
    });
  });
});
