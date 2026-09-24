import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { StageRequestsPage } from "./StageRequestsPage";

const getStageRequestsMock = vi.fn();
const getStageRequestDetailMock = vi.fn();
const getStructureTypesMock = vi.fn();
const getReferentsMock = vi.fn();
const assignReferentMock = vi.fn();
const createReferentMock = vi.fn();
const refuseStageRequestMock = vi.fn();
const validateStageRequestMock = vi.fn();

vi.mock("./api", () => ({
  getStageRequests: (...args: unknown[]) => getStageRequestsMock(...args),
  getStageRequestDetail: (...args: unknown[]) => getStageRequestDetailMock(...args),
  getReferents: (...args: unknown[]) => getReferentsMock(...args),
  assignReferent: (...args: unknown[]) => assignReferentMock(...args),
  createReferent: (...args: unknown[]) => createReferentMock(...args),
  refuseStageRequest: (...args: unknown[]) => refuseStageRequestMock(...args),
  validateStageRequest: (...args: unknown[]) => validateStageRequestMock(...args),
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
    otherLiveStageCount: 0,
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
    getReferentsMock.mockReset();
    assignReferentMock.mockReset();
    createReferentMock.mockReset();
    refuseStageRequestMock.mockReset();
    validateStageRequestMock.mockReset();
    getStructureTypesMock.mockResolvedValue(STRUCTURE_TYPES);
    getReferentsMock.mockResolvedValue([referent]);
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
    expect(within(row).getByDisplayValue("Claire Bernard")).toBeInTheDocument();
  });

  it("ADR-0014: marks a mandatory stage 'Obligatoire' and a request without referent shows an empty picker", async () => {
    getStageRequestsMock.mockResolvedValue([request({ mandatory: true, referent: null })]);
    renderPage();

    const row = (await screen.findByText("Alice Martin")).closest("tr")!;
    expect(row).toHaveTextContent("Obligatoire");
    expect(within(row).getByRole("combobox")).toHaveValue("");
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

  describe("inline referent picker — issue #148", () => {
    it("ADR-0014: picking a referent assigns it on the exact tuple, and the row shows it once the list refetches", async () => {
      const user = userEvent.setup();
      getStageRequestsMock
        .mockResolvedValueOnce([request({ referent: null })])
        .mockResolvedValueOnce([request({ referent })]);
      getReferentsMock.mockResolvedValue([referent]);
      assignReferentMock.mockResolvedValue(referent);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Claire Bernard" }));

      expect(assignReferentMock).toHaveBeenCalledWith({
        studentId: "student-1",
        schoolYear: "2026-2027",
        semester: "S1",
        mandatory: true,
        referentId: "ref-1",
      });
      await waitFor(() =>
        expect(within(row).getByDisplayValue("Claire Bernard")).toBeInTheDocument(),
      );
    });

    it("shows an error when the assignment fails", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      assignReferentMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Claire Bernard" }));

      expect(
        await screen.findByText("Impossible d'assigner le référent, merci de réessayer."),
      ).toBeInTheDocument();
    });

    it("clicking the picker does not expand or collapse the row's detail", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));

      expect(getStageRequestDetailMock).not.toHaveBeenCalled();
    });
  });

  describe("impact confirmation — issue #149", () => {
    const tuple = {
      studentId: "student-1",
      schoolYear: "2026-2027",
      semester: "S1",
      mandatory: true,
      referentId: "ref-1",
    };

    async function pickReferent(user: ReturnType<typeof userEvent.setup>) {
      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Claire Bernard" }));
    }

    it("ADR-0014: a change that also reaches the student's other live requests asks first, naming how many and whose, and applies only once confirmed", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ otherLiveStageCount: 2 })]);
      assignReferentMock.mockResolvedValue(referent);
      renderPage();

      await pickReferent(user);

      const dialog = await screen.findByRole("dialog", { name: "Changer le référent" });
      expect(
        within(dialog).getByText(
          "Ce changement s'applique aussi à 2 autres demandes en cours de l'étudiant Alice Martin.",
        ),
      ).toBeInTheDocument();
      expect(assignReferentMock).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Confirmer" }));

      expect(assignReferentMock).toHaveBeenCalledWith(tuple);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("uses the singular for a single other live request", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ otherLiveStageCount: 1 })]);
      renderPage();

      await pickReferent(user);

      const dialog = await screen.findByRole("dialog", { name: "Changer le référent" });
      expect(
        within(dialog).getByText(
          "Ce changement s'applique aussi à 1 autre demande en cours de l'étudiant Alice Martin.",
        ),
      ).toBeInTheDocument();
    });

    it("cancelling leaves the assignment untouched and the picker on the current referent", async () => {
      const user = userEvent.setup();
      const current = { id: "ref-0", firstName: "Jean", lastName: "Petit" };
      getReferentsMock.mockResolvedValue([current, referent]);
      getStageRequestsMock.mockResolvedValue([
        request({ referent: current, otherLiveStageCount: 1 }),
      ]);
      renderPage();

      await pickReferent(user);
      const dialog = await screen.findByRole("dialog", { name: "Changer le référent" });
      await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(assignReferentMock).not.toHaveBeenCalled();
      const row = screen.getByText("Alice Martin").closest("tr")!;
      expect(within(row).getByDisplayValue("Jean Petit")).toBeInTheDocument();
    });

    it("a change that touches only this request applies immediately, with no confirmation", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ otherLiveStageCount: 0 })]);
      assignReferentMock.mockResolvedValue(referent);
      renderPage();

      await pickReferent(user);

      expect(assignReferentMock).toHaveBeenCalledWith(tuple);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("a referent created on the fly goes through the same confirmation (ADR-0031)", async () => {
      const user = userEvent.setup();
      const created = { id: "ref-new", firstName: "Paul", lastName: "Durand" };
      getStageRequestsMock.mockResolvedValue([request({ otherLiveStageCount: 1 })]);
      createReferentMock.mockResolvedValue(created);
      assignReferentMock.mockResolvedValue(created);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Ajouter un référent" }));
      const form = await screen.findByRole("dialog", { name: "Ajouter un référent" });
      await user.type(within(form).getByLabelText("Prénom"), "Paul");
      await user.type(within(form).getByLabelText("Nom"), "Durand");
      await user.type(within(form).getByLabelText("Email"), "paul.durand@example.org");
      await user.click(within(form).getByRole("button", { name: "Ajouter" }));

      const dialog = await screen.findByRole("dialog", { name: "Changer le référent" });
      expect(assignReferentMock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Confirmer" }));

      expect(assignReferentMock).toHaveBeenCalledWith({ ...tuple, referentId: "ref-new" });
    });
  });

  describe("add a referent on the fly — issue #150", () => {
    const created = { id: "ref-new", firstName: "Paul", lastName: "Durand" };

    async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Ajouter un référent" }));
      return screen.findByRole("dialog", { name: "Ajouter un référent" });
    }

    it("the picker offers an 'add a referent' option that opens a first name / last name / email form for the current request", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const dialog = await openAddDialog(user);

      expect(within(dialog).getByText(/Alice Martin/)).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Prénom")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Nom")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
      expect(assignReferentMock).not.toHaveBeenCalled();
    });

    it("closes the picker's dropdown once the 'add a referent' form is open", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      await openAddDialog(user);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("keeps the picker's dropdown closed when the 'add a referent' form is cancelled", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const dialog = await openAddDialog(user);
      await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("validates the form against the shared schema: nothing is sent while it is invalid", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const dialog = await openAddDialog(user);
      await user.type(within(dialog).getByLabelText("Email"), "not-an-email");
      await user.click(within(dialog).getByRole("button", { name: "Ajouter" }));

      expect(await within(dialog).findByText("Le prénom est requis")).toBeInTheDocument();
      expect(within(dialog).getByText("Le nom est requis")).toBeInTheDocument();
      expect(within(dialog).getByText("Adresse email invalide")).toBeInTheDocument();
      expect(createReferentMock).not.toHaveBeenCalled();
    });

    it("ADR-0031: submitting creates the referent, then assigns it to the request on its exact tuple, and closes the form", async () => {
      const user = userEvent.setup();
      getStageRequestsMock
        .mockResolvedValueOnce([request({ referent: null })])
        .mockResolvedValue([request({ referent: created })]);
      createReferentMock.mockResolvedValue(created);
      assignReferentMock.mockResolvedValue(created);
      renderPage();

      const dialog = await openAddDialog(user);
      await user.type(within(dialog).getByLabelText("Prénom"), "Paul");
      await user.type(within(dialog).getByLabelText("Nom"), "Durand");
      await user.type(within(dialog).getByLabelText("Email"), "paul.durand@example.org");
      await user.click(within(dialog).getByRole("button", { name: "Ajouter" }));

      await waitFor(() =>
        expect(assignReferentMock).toHaveBeenCalledWith({
          studentId: "student-1",
          schoolYear: "2026-2027",
          semester: "S1",
          mandatory: true,
          referentId: "ref-new",
        }),
      );
      expect(createReferentMock).toHaveBeenCalledWith({
        firstName: "Paul",
        lastName: "Durand",
        email: "paul.durand@example.org",
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const row = screen.getByText("Alice Martin").closest("tr")!;
      await waitFor(() => expect(within(row).getByDisplayValue("Paul Durand")).toBeInTheDocument());
    });

    it("keeps the form open with an error, and assigns nothing, when the referent cannot be created", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      createReferentMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const dialog = await openAddDialog(user);
      await user.type(within(dialog).getByLabelText("Prénom"), "Paul");
      await user.type(within(dialog).getByLabelText("Nom"), "Durand");
      await user.type(within(dialog).getByLabelText("Email"), "paul.durand@example.org");
      await user.click(within(dialog).getByRole("button", { name: "Ajouter" }));

      expect(
        await within(dialog).findByText("Impossible d'ajouter le référent, merci de réessayer."),
      ).toBeInTheDocument();
      expect(assignReferentMock).not.toHaveBeenCalled();
    });

    it("ADR-0031: an email already used under another name keeps the form open with a specific error, and assigns nothing", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      createReferentMock.mockRejectedValue(new ApiError(409, "Conflict"));
      renderPage();

      const dialog = await openAddDialog(user);
      await user.type(within(dialog).getByLabelText("Prénom"), "Paul");
      await user.type(within(dialog).getByLabelText("Nom"), "Durand");
      await user.type(within(dialog).getByLabelText("Email"), "claire.bernard@example.org");
      await user.click(within(dialog).getByRole("button", { name: "Ajouter" }));

      expect(
        await within(dialog).findByText(
          "Cette adresse email appartient déjà à une personne d'un autre nom.",
        ),
      ).toBeInTheDocument();
      expect(assignReferentMock).not.toHaveBeenCalled();
    });

    it("shows an error on the page when the referent was created but its assignment then fails", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      createReferentMock.mockResolvedValue(created);
      assignReferentMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const dialog = await openAddDialog(user);
      await user.type(within(dialog).getByLabelText("Prénom"), "Paul");
      await user.type(within(dialog).getByLabelText("Nom"), "Durand");
      await user.type(within(dialog).getByLabelText("Email"), "paul.durand@example.org");
      await user.click(within(dialog).getByRole("button", { name: "Ajouter" }));

      expect(
        await screen.findByText("Impossible d'assigner le référent, merci de réessayer."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("cancelling closes the form without creating or assigning anything", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const dialog = await openAddDialog(user);
      await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(createReferentMock).not.toHaveBeenCalled();
      expect(assignReferentMock).not.toHaveBeenCalled();
    });

    it("clicking inside the form does not expand the row behind it", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const dialog = await openAddDialog(user);
      await user.click(within(dialog).getByLabelText("Prénom"));

      expect(getStageRequestDetailMock).not.toHaveBeenCalled();
    });
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

  describe("Refuse a request — issue #151", () => {
    it("disables the refuse button, with a hint, while the request has no referent", async () => {
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      expect(within(row).getByRole("button", { name: "Refuser" })).toBeDisabled();
    });

    it("enables the refuse button once a referent is assigned, and opens the reason dialog", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      const refuseButton = within(row).getByRole("button", { name: "Refuser" });
      expect(refuseButton).toBeEnabled();
      await user.click(refuseButton);

      expect(await screen.findByText("Refuser la demande")).toBeInTheDocument();
      // Clicking the row's refuse button must not also toggle the expand row.
      expect(getStageRequestDetailMock).not.toHaveBeenCalled();
    });

    it("keeps Refuser disabled until at least one reason is given", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Refuser" }));
      const dialog = await screen.findByRole("dialog");

      const submit = within(dialog).getByRole("button", { name: "Refuser" });
      expect(submit).toBeDisabled();

      await user.click(within(dialog).getByLabelText("L'adresse de l'organisme est incomplète."));
      expect(submit).toBeEnabled();
    });

    it("shows 'Autre précision :' as static text above Précision, not a selectable reason with its own input", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Refuser" }));
      const dialog = await screen.findByRole("dialog");

      expect(within(dialog).queryByLabelText("Autre précision :")).not.toBeInTheDocument();
      expect(within(dialog).queryByLabelText("Informations manquantes")).not.toBeInTheDocument();

      const hint = within(dialog).getByText("Autre précision :");
      const precisionField = within(dialog).getByLabelText("Précision (facultatif)");
      const hintPrecedesPrecision = Boolean(
        hint.compareDocumentPosition(precisionField) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(hintPrecedesPrecision).toBe(true);
    });

    it("builds the reason string, calls refuseStageRequest with the request's version, and closes the dialog on success", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent, version: 3 })]);
      refuseStageRequestMock.mockResolvedValue({
        id: "stage-1",
        status: "REFUSED",
        decidedAt: "2026-09-23T10:00:00.000Z",
      });
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Refuser" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByLabelText("L'adresse de l'organisme est incomplète."));
      await user.type(within(dialog).getByLabelText("Précision (facultatif)"), "À vérifier");
      await user.click(within(dialog).getByRole("button", { name: "Refuser" }));

      await waitFor(() =>
        expect(refuseStageRequestMock).toHaveBeenCalledWith("stage-1", {
          version: 3,
          reason: "- L'adresse de l'organisme est incomplète.\nAutre précision : À vérifier",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("BR-09: shows a reload toast on a 409 conflict and closes the dialog", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      refuseStageRequestMock.mockRejectedValue(new ApiError(409, "conflict"));
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Refuser" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByLabelText("L'adresse de l'organisme est incomplète."));
      await user.click(within(dialog).getByRole("button", { name: "Refuser" }));

      expect(
        await screen.findByText("Cette demande a été modifiée entre-temps. Rechargez la page."),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("Validate a request — issue #152", () => {
    it("disables the validate button, with a hint, while the request has no referent", async () => {
      getStageRequestsMock.mockResolvedValue([request({ referent: null })]);
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      expect(within(row).getByRole("button", { name: "Valider" })).toBeDisabled();
    });

    it("validates on a single click, with no confirmation step", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent, version: 3 })]);
      validateStageRequestMock.mockResolvedValue({
        id: "stage-1",
        status: "VALIDATED",
        decidedAt: "2026-09-24T10:00:00.000Z",
      });
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      const validateButton = within(row).getByRole("button", { name: "Valider" });
      expect(validateButton).toBeEnabled();
      await user.click(validateButton);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(validateStageRequestMock).toHaveBeenCalledWith("stage-1", { version: 3 }),
      );
      // Clicking the row's validate button must not also toggle the expand row.
      expect(getStageRequestDetailMock).not.toHaveBeenCalled();
    });

    it("BR-09: shows a reload toast on a 409 conflict", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      validateStageRequestMock.mockRejectedValue(new ApiError(409, "conflict"));
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Valider" }));

      expect(
        await screen.findByText("Cette demande a été modifiée entre-temps. Rechargez la page."),
      ).toBeInTheDocument();
    });

    it("shows an inline error on a non-conflict failure", async () => {
      const user = userEvent.setup();
      getStageRequestsMock.mockResolvedValue([request({ referent })]);
      validateStageRequestMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const row = (await screen.findByText("Alice Martin")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Valider" }));

      expect(
        await screen.findByText("Impossible de valider la demande, merci de réessayer."),
      ).toBeInTheDocument();
    });
  });
});
