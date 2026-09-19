import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "../../test/setup";
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
  await user.click(screen.getByRole("button", { name: /créer un nouvel organisme/i }));
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

  await user.click(await screen.findByRole("button", { name: /créer un nouveau tuteur/i }));
  await fillNewTutorForm(user);
}

// The recap renders each entry as a <dt> label paired with a <dd> value, so a
// label can never be mistaken for what the student typed (QA feedback, PR #135).
function expectRecapField(label: string, value: string) {
  const term = screen.getByText(label, { selector: "dt" });
  expect(term.nextElementSibling).toHaveTextContent(value);
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
    setMatchMedia(false);
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

  it("shows the period alerts above the list of periods, not below it", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    const emptyAlert = await screen.findByText(/au moins une période est requise/i);
    const addButton = screen.getByRole("button", { name: /ajouter une période/i });
    expect(emptyAlert.compareDocumentPosition(addButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await user.click(addButton);
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-15");
    await user.type(endInput!, "2025-10-01");

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert.compareDocumentPosition(startInput!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

    expect(await screen.findByText(/semestre.*S1/i)).toBeInTheDocument();
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

    await user.click(screen.getByLabelText(/^oui$/i));

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
    await user.click(screen.getByLabelText(/^oui$/i));
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

  it("offers organism/tutor creation as buttons below the pickers, not as dropdown options", async () => {
    const user = userEvent.setup();
    renderPage();

    await openOrganismPicker(user);
    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /créer un nouvel organisme/i })).toBeNull();
    expect(screen.getByRole("button", { name: /créer un nouvel organisme/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /créer un nouvel organisme/i }));
    await fillNewOrganismForm(user);

    await user.click(await screen.findByLabelText(/sélectionner un tuteur/i));
    expect(screen.queryByRole("option", { name: /créer un nouveau tuteur/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /créer un nouveau tuteur/i }));

    await user.type(screen.getByLabelText(/^prénom$/i), "Karim");
    await user.type(screen.getByLabelText(/^nom$/i), "Belkacem");
    await user.type(screen.getByLabelText(/^email$/i), "k.belkacem@example.org");
    await user.type(screen.getByLabelText(/fonction/i), "Directeur");
    await user.click(screen.getByLabelText(/accepte d'être contacté par téléphone/i));
    await user.click(screen.getByRole("button", { name: /valider ce nouveau tuteur/i }));

    expect(
      await screen.findByText(/Karim Belkacem \(Directeur, nouveau tuteur\)/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByLabelText(/^oui$/i));
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /enregistrer le brouillon/i }));

    await waitFor(() => expect(createStageDraftMock).toHaveBeenCalledTimes(1));
    const payload = createStageDraftMock.mock.calls[0]![0];
    expect(payload.tutor).toMatchObject({ data: { acceptsPhoneContact: true } });
  });

  it("only allows digits and '+' in the new tutor's phone field", async () => {
    const user = userEvent.setup();
    renderPage();

    await pickCreateNewOrganism(user);
    await fillNewOrganismForm(user);
    await user.click(await screen.findByRole("button", { name: /créer un nouveau tuteur/i }));

    const phoneInput = screen.getByLabelText(/^téléphone/i);
    await user.type(phoneInput, "06 12a34-56b78");

    expect(phoneInput).toHaveValue("0612345678");
  });

  it("shows only a compact step indicator on mobile, and the full stepper on desktop", async () => {
    setMatchMedia(true);
    const mobile = renderPage();
    expect(screen.getByText(/étape 1 sur 4/i)).toBeInTheDocument();
    expect(screen.queryByText("Récapitulatif")).toBeNull();
    mobile.unmount();

    setMatchMedia(false);
    renderPage();
    expect(screen.queryByText(/étape 1 sur 4/i)).toBeNull();
    expect(screen.getByText("Récapitulatif")).toBeInTheDocument();
  });

  it("shows every field entered in the previous steps on the recap", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");
    await user.click(screen.getByRole("button", { name: /suivant/i }));

    await user.type(screen.getByLabelText(/^service$/i), "Service RH");
    await user.type(screen.getByLabelText(/type de handicap concerné/i), "Moteur");
    await user.type(screen.getByLabelText(/^motivation$/i), "Découvrir le secteur associatif");
    await user.click(screen.getByLabelText(/^oui$/i));
    await user.click(screen.getByRole("button", { name: /suivant/i }));

    expect(screen.getByText("Fondation OVE")).toBeInTheDocument();
    expect(screen.getByText("Karim Belkacem (Directeur)")).toBeInTheDocument();
    expect(screen.getByText(/2025-10-01.*2025-10-15/)).toBeInTheDocument();
    expectRecapField("Service", "Service RH");
    expectRecapField("Type de handicap concerné", "Moteur");
    expectRecapField("Motivation", "Découvrir le secteur associatif");
    expectRecapField("Stage obligatoire", "Oui");
  });

  it("does not tell the student on the recap that the organism and tutor are new", async () => {
    const user = userEvent.setup();
    renderPage();

    await resolveOrganismAndTutorInline(user);
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /ajouter une période/i }));
    const [startInput, endInput] = screen.getAllByLabelText(/début|fin/i);
    await user.type(startInput!, "2025-10-01");
    await user.type(endInput!, "2025-10-15");
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByLabelText(/^non$/i));
    await user.click(screen.getByRole("button", { name: /suivant/i }));

    expect(screen.queryByText(/nouvel organisme/i)).toBeNull();
    expect(screen.queryByText(/nouveau tuteur/i)).toBeNull();
    expectRecapField("Stage obligatoire", "Non");
  });
});
