import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewStagePage } from "./NewStagePage";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const searchOrganismsMock = vi.fn();
const getOrganismMock = vi.fn();
const getStructureTypesMock = vi.fn();
vi.mock("../organisms/api", () => ({
  searchOrganisms: (...args: unknown[]) => searchOrganismsMock(...args),
  getOrganism: (...args: unknown[]) => getOrganismMock(...args),
  getStructureTypes: (...args: unknown[]) => getStructureTypesMock(...args),
}));

const createStageDraftMock = vi.fn();
vi.mock("./api", () => ({
  createStageDraft: (...args: unknown[]) => createStageDraftMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NewStagePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openOrganismPicker(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText(/rechercher un organisme/i);
  await user.click(input);
  return input;
}

async function pickCreateNewOrganism(user: ReturnType<typeof userEvent.setup>) {
  await openOrganismPicker(user);
  await user.click(await screen.findByText(/créer une nouvelle structure/i));
}

async function fillNewOrganismForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom de l'organisme/i), "Fondation OVE");
  await user.click(screen.getByLabelText(/type de structure/i));
  await user.click(await screen.findByText("Association"));
  await user.type(screen.getByLabelText(/adresse/i), "1 rue Test");
  await user.type(screen.getByLabelText(/code postal/i), "69000");
  await user.type(screen.getByLabelText(/ville/i), "Lyon");
  await user.click(screen.getByRole("button", { name: /valider ce nouvel organisme/i }));
}

async function fillNewTutorForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^prénom$/i), "Karim");
  await user.type(screen.getByLabelText(/^nom$/i), "Belkacem");
  await user.type(screen.getByLabelText(/^email$/i), "k.belkacem@example.org");
  await user.type(screen.getByLabelText(/fonction/i), "Directeur");
  await user.click(screen.getByRole("button", { name: /valider ce nouveau tuteur/i }));
}

async function resolveOrganismAndTutorInline(user: ReturnType<typeof userEvent.setup>) {
  await pickCreateNewOrganism(user);
  await fillNewOrganismForm(user);

  const tutorInput = await screen.findByLabelText(/sélectionner un tuteur/i);
  await user.click(tutorInput);
  await user.click(await screen.findByText(/nouveau tuteur/i));
  await fillNewTutorForm(user);
}

describe("NewStagePage", () => {
  beforeEach(() => {
    searchOrganismsMock.mockReset().mockResolvedValue([]);
    getOrganismMock.mockReset();
    getStructureTypesMock.mockReset().mockResolvedValue([{ id: "st-1", label: "Association" }]);
    createStageDraftMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("finds and selects an existing organism, prefilling structureType/address read-only", async () => {
    const user = userEvent.setup();
    searchOrganismsMock.mockResolvedValue([
      { id: "org-1", name: "Hôpital Cochin", structureType: "Hôpital", city: "Paris" },
    ]);
    getOrganismMock.mockResolvedValue({
      id: "org-1",
      name: "Hôpital Cochin",
      structureType: "Hôpital",
      city: "Paris",
      postalCode: "75014",
      street: "27 Rue du Faubourg Saint-Jacques",
      tutors: [],
    });
    renderPage();

    const input = await openOrganismPicker(user);
    await user.type(input, "Cochin");

    await user.click(await screen.findByText("Hôpital Cochin"));

    expect(await screen.findByText(/27 Rue du Faubourg Saint-Jacques/i)).toBeInTheDocument();
    // No tutors yet for this organism — this must not be an error state, just
    // an empty picker with only "Nouveau tuteur" available.
    expect(screen.getByLabelText(/sélectionner un tuteur/i)).toBeInTheDocument();
  });

  it("creates a new organism and a new tutor inline, without leaving the wizard", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);

    expect(
      await screen.findByText(/Karim Belkacem \(Directeur, nouveau tuteur\)/i),
    ).toBeInTheDocument();
    // Still on step 1 (Organisme & tuteur) — "Suivant" is now enabled.
    expect(screen.getByRole("button", { name: /suivant/i })).toBeEnabled();
  });

  it("blocks advancing past the periods step until at least one valid period exists", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));

    expect(await screen.findByText(/au moins une période est requise/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suivant/i })).toBeDisabled();
  });

  it("shows the derived-semester preview and enables Suivant for a valid single period", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));

    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");

    expect(await screen.findByText(/semestre dérivé.*S1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suivant/i })).toBeEnabled();
  });

  it("requires an explicit mandatory choice before advancing to the recap (no silent default, issue #113 AC)", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");
    await user.click(screen.getByRole("button", { name: /suivant/i }));

    expect(screen.getByRole("button", { name: /suivant/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/oui, ce stage est obligatoire/i));

    expect(screen.getByRole("button", { name: /suivant/i })).toBeEnabled();
  });

  it("submits the expected payload shape and navigates to the dashboard on success", async () => {
    const user = userEvent.setup();
    createStageDraftMock.mockResolvedValue({ id: "stage-1" });
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByLabelText(/oui, ce stage est obligatoire/i));
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /enregistrer le brouillon/i }));

    await waitFor(() => expect(createStageDraftMock).toHaveBeenCalledTimes(1));
    const payload = createStageDraftMock.mock.calls[0]![0];
    expect(payload).toMatchObject({
      organism: { mode: "new", data: { name: "Fondation OVE" } },
      tutor: { mode: "new", data: { firstName: "Karim", lastName: "Belkacem" } },
      mandatory: true,
    });
    expect(payload.periods).toHaveLength(1);
    // No `semester` key is ever sent — it's server-derived (BR-04b).
    expect(payload).not.toHaveProperty("semester");

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });
});
