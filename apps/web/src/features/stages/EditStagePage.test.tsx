import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { OrganismDetailResponse, StageDetailResponse } from "shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { EditStagePage } from "./EditStagePage";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const getOrganismMock = vi.fn();
vi.mock("../organisms/api", () => ({
  searchOrganisms: vi.fn().mockResolvedValue([]),
  getOrganism: (...args: unknown[]) => getOrganismMock(...args),
  getStructureTypes: vi.fn().mockResolvedValue([{ id: "st-1", label: "Secteur Sanitaire" }]),
}));

const getStageMock = vi.fn();
const updateStageDraftMock = vi.fn();
const submitStageMock = vi.fn();
vi.mock("./api", () => ({
  getStage: (...args: unknown[]) => getStageMock(...args),
  updateStageDraft: (...args: unknown[]) => updateStageDraftMock(...args),
  submitStage: (...args: unknown[]) => submitStageMock(...args),
}));

const getProfileMock = vi.fn();
vi.mock("../students/api", () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
}));

const ORGANISM_ID = "11111111-1111-1111-1111-111111111111";
const TUTOR_ID = "22222222-2222-2222-2222-222222222222";

function draft(overrides: Partial<StageDetailResponse> = {}): StageDetailResponse {
  return {
    id: "stage-1",
    status: "DRAFT",
    version: 3,
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    service: "Cardiologie",
    projectType: "Handicap moteur",
    motivation: "Découvrir le métier",
    organism: {
      id: ORGANISM_ID,
      name: "Hôpital Cochin",
      structureType: "Secteur Sanitaire",
      city: "Paris",
      postalCode: "75014",
      street: "27 Rue du Faubourg Saint-Jacques",
      editable: true,
    },
    tutor: {
      id: TUTOR_ID,
      firstName: "Marie",
      lastName: "Curie",
      email: "m.curie@example.org",
      jobTitle: "Médecin",
      phone: null,
      acceptsPhoneContact: false,
      editable: true,
    },
    periods: [
      { id: "p1", startDate: "2025-10-01T00:00:00.000Z", endDate: "2025-10-15T00:00:00.000Z" },
    ],
    submittedAt: null,
    refusalReason: null,
    referent: null,
    ...overrides,
  };
}

function organismDetail(): OrganismDetailResponse {
  const { organism, tutor } = draft();
  return {
    id: organism.id,
    name: organism.name,
    structureType: organism.structureType,
    city: organism.city,
    postalCode: organism.postalCode,
    street: organism.street,
    tutors: [{ ...tutor }],
  };
}

function conflictError(code: string, message: string) {
  return new ApiError(409, JSON.stringify({ statusCode: 409, code, message }));
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/stages/stage-1/edit"]}>
        <Routes>
          <Route path="/stages/:id/edit" element={<EditStagePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function nextStep(user: User) {
  await user.click(screen.getByRole("button", { name: /suivant/i }));
}

// Organisme & tuteur -> Périodes -> Détails -> Récapitulatif, touching nothing.
async function walkToRecap(user: User) {
  await screen.findByText("Hôpital Cochin");
  await nextStep(user);
  await nextStep(user);
  await nextStep(user);
}

// "Soumettre" stays disabled until the profile status is known (the gate).
async function submit(user: User) {
  const button = await screen.findByRole("button", { name: /soumettre/i });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

async function saveDraft(user: User) {
  await user.click(await screen.findByRole("button", { name: /enregistrer le brouillon/i }));
}

describe("EditStagePage (issue #116)", () => {
  beforeEach(() => {
    // The draft's periods are in October 2025 (school year 2025-2026): fake only
    // Date, so the previous-school-year submission blocker never depends on the
    // real clock and user-event keeps its real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-09-15T10:00:00.000Z"));
    getStageMock.mockReset().mockResolvedValue(draft());
    getOrganismMock.mockReset().mockResolvedValue(organismDetail());
    updateStageDraftMock.mockReset().mockResolvedValue(draft({ version: 4 }));
    submitStageMock.mockReset();
    getProfileMock.mockReset().mockResolvedValue({ profileStatus: "VALID" });
    navigateMock.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("loads the draft it is opened on", async () => {
    renderPage();

    await screen.findByText("Hôpital Cochin");
    expect(getStageMock).toHaveBeenCalledWith("stage-1");
    expect(screen.getByRole("heading", { name: /modifier la demande de stage/i })).toBeVisible();
  });

  describe("pre-fill", () => {
    it("shows the draft's organism and tutor on the first step", async () => {
      renderPage();

      expect(await screen.findByText("Hôpital Cochin")).toBeVisible();
      expect(await screen.findByText(/marie curie \(médecin\)/i)).toBeVisible();
    });

    it("pre-fills every period, as dates", async () => {
      const user = userEvent.setup();
      getStageMock.mockResolvedValue(
        draft({
          periods: [
            {
              id: "p1",
              startDate: "2025-10-01T00:00:00.000Z",
              endDate: "2025-10-15T00:00:00.000Z",
            },
            {
              id: "p2",
              startDate: "2025-11-03T00:00:00.000Z",
              endDate: "2025-11-07T00:00:00.000Z",
            },
          ],
        }),
      );
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await nextStep(user);

      const inputs = screen.getAllByLabelText(/début|fin/i);
      expect(inputs.map((input) => (input as HTMLInputElement).value)).toEqual([
        "2025-10-01",
        "2025-10-15",
        "2025-11-03",
        "2025-11-07",
      ]);
    });

    it("pre-fills the details and the mandatory choice", async () => {
      const user = userEvent.setup();
      getStageMock.mockResolvedValue(draft({ mandatory: false }));
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await nextStep(user);
      await nextStep(user);

      expect(screen.getByLabelText("Service")).toHaveValue("Cardiologie");
      expect(screen.getByLabelText("Type de handicap concerné")).toHaveValue("Handicap moteur");
      expect(screen.getByLabelText("Motivation")).toHaveValue("Découvrir le métier");
      expect(screen.getByLabelText(/^non$/i)).toBeChecked();
    });

    it("leaves a never-filled optional text empty rather than showing 'null'", async () => {
      const user = userEvent.setup();
      getStageMock.mockResolvedValue(draft({ service: null }));
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await nextStep(user);
      await nextStep(user);

      expect(screen.getByLabelText("Service")).toHaveValue("");
    });
  });

  describe("saving", () => {
    it("PATCHes the draft with the version it read, the untouched organism/tutor as existing, and no semester (BR-04b, BR-09)", async () => {
      const user = userEvent.setup();
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);

      await waitFor(() => expect(updateStageDraftMock).toHaveBeenCalledTimes(1));
      const [id, payload] = updateStageDraftMock.mock.calls[0]!;
      expect(id).toBe("stage-1");
      expect(payload).toMatchObject({
        version: 3,
        organism: { mode: "existing", id: ORGANISM_ID },
        tutor: { mode: "existing", id: TUTOR_ID },
        mandatory: true,
        service: "Cardiologie",
        projectType: "Handicap moteur",
        motivation: "Découvrir le métier",
      });
      expect(payload.periods).toHaveLength(1);
      expect(payload).not.toHaveProperty("semester");
    });

    it("returns to the draft's detail page after a plain save, without submitting", async () => {
      const user = userEvent.setup();
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);

      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/stages/stage-1"));
      expect(submitStageMock).not.toHaveBeenCalled();
    });

    it("saves, then submits the saved draft, then goes to the request list", async () => {
      const user = userEvent.setup();
      submitStageMock.mockResolvedValue(draft({ status: "PENDING" }));
      renderPage();

      await walkToRecap(user);
      await submit(user);

      await waitFor(() => expect(submitStageMock).toHaveBeenCalledWith("stage-1"));
      expect(updateStageDraftMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/stages"));
    });

    it("when the save worked but the submission failed, retries only the submission with no second PATCH (the version already moved)", async () => {
      const user = userEvent.setup();
      submitStageMock
        .mockRejectedValueOnce(new ApiError(500, "boom"))
        .mockResolvedValueOnce(draft({ status: "PENDING" }));
      renderPage();

      await walkToRecap(user);
      await submit(user);
      expect(await screen.findByText(/n'a pas été soumis/i)).toBeVisible();

      await submit(user);

      await waitFor(() => expect(submitStageMock).toHaveBeenCalledTimes(2));
      expect(updateStageDraftMock).toHaveBeenCalledTimes(1);
    });

    it("shows a generic error and stays on the recap when the save fails", async () => {
      const user = userEvent.setup();
      updateStageDraftMock.mockRejectedValue(new ApiError(500, "boom"));
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);

      expect(
        await screen.findByText(/erreur est survenue lors de l'enregistrement/i),
      ).toBeVisible();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe("BR-09: a stale version", () => {
    it("says the draft was modified and offers to reload it, instead of a generic error", async () => {
      const user = userEvent.setup();
      updateStageDraftMock.mockRejectedValue(
        conflictError("STAGE_VERSION_CONFLICT", "Cette demande a été modifiée entre-temps."),
      );
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);

      expect(await screen.findByText(/cette demande a été modifiée/i)).toBeVisible();
      expect(screen.getByRole("button", { name: /recharger/i })).toBeVisible();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it("reloading refetches the draft and restarts the wizard on the fresh data, at its new version", async () => {
      const user = userEvent.setup();
      updateStageDraftMock
        .mockRejectedValueOnce(conflictError("STAGE_VERSION_CONFLICT", "Modifiée."))
        .mockResolvedValueOnce(draft({ version: 8 }));
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);
      getStageMock.mockResolvedValue(draft({ version: 7, service: "Neurologie" }));
      await user.click(await screen.findByRole("button", { name: /recharger/i }));

      // Back on the first step, on the server's current data.
      await screen.findByText("Hôpital Cochin");
      expect(screen.queryByRole("button", { name: /enregistrer le brouillon/i })).toBeNull();
      await nextStep(user);
      await nextStep(user);
      expect(screen.getByLabelText("Service")).toHaveValue("Neurologie");
      await nextStep(user);
      await saveDraft(user);

      await waitFor(() => expect(updateStageDraftMock).toHaveBeenCalledTimes(2));
      expect(updateStageDraftMock.mock.calls[1]![1]).toMatchObject({ version: 7 });
    });
  });

  describe("organism and tutor: correcting versus creating", () => {
    it("offers to edit the organism and the tutor while they are unfrozen", async () => {
      renderPage();

      await screen.findByText("Hôpital Cochin");

      expect(screen.getByRole("button", { name: /modifier l'organisme/i })).toBeVisible();
      expect(await screen.findByRole("button", { name: /modifier le tuteur/i })).toBeVisible();
    });

    it("sends an in-place edit of the organism, keeping the tutor, once its form is validated", async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await user.click(screen.getByRole("button", { name: /modifier l'organisme/i }));
      const name = screen.getByLabelText(/nom de l'organisme/i);
      expect(name).toHaveValue("Hôpital Cochin");
      await user.clear(name);
      await user.type(name, "Hôpital Necker");
      await user.click(screen.getByRole("button", { name: /valider les modifications/i }));

      expect(await screen.findByText("Hôpital Necker")).toBeVisible();
      await nextStep(user);
      await nextStep(user);
      await nextStep(user);
      await saveDraft(user);

      await waitFor(() => expect(updateStageDraftMock).toHaveBeenCalledTimes(1));
      expect(updateStageDraftMock.mock.calls[0]![1]).toMatchObject({
        organism: { mode: "edit", id: ORGANISM_ID, data: { name: "Hôpital Necker" } },
        tutor: { mode: "existing", id: TUTOR_ID },
      });
    });

    it("sends an in-place edit of the tutor", async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await user.click(await screen.findByRole("button", { name: /modifier le tuteur/i }));
      const jobTitle = screen.getByLabelText(/fonction/i);
      expect(jobTitle).toHaveValue("Médecin");
      await user.clear(jobTitle);
      await user.type(jobTitle, "Cheffe de service");
      await user.click(screen.getByRole("button", { name: /valider les modifications/i }));

      await nextStep(user);
      await nextStep(user);
      await nextStep(user);
      await saveDraft(user);

      await waitFor(() => expect(updateStageDraftMock).toHaveBeenCalledTimes(1));
      expect(updateStageDraftMock.mock.calls[0]![1]).toMatchObject({
        organism: { mode: "existing", id: ORGANISM_ID },
        tutor: { mode: "edit", id: TUTOR_ID, data: { jobTitle: "Cheffe de service" } },
      });
    });

    it("validates the edited organism with the same rules as creation", async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await user.click(screen.getByRole("button", { name: /modifier l'organisme/i }));
      await user.clear(screen.getByLabelText(/nom de l'organisme/i));
      await user.click(screen.getByRole("button", { name: /valider les modifications/i }));

      expect(await screen.findByText(/le nom de l'organisme est requis/i)).toBeVisible();
    });

    it("lets Précédent back out of the edit form, leaving the organism untouched", async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText("Hôpital Cochin");
      await user.click(screen.getByRole("button", { name: /modifier l'organisme/i }));
      await user.click(screen.getByRole("button", { name: /précédent/i }));

      expect(screen.queryByLabelText(/nom de l'organisme/i)).toBeNull();
      expect(screen.getByText("Hôpital Cochin")).toBeVisible();
    });

    it("steers to creating a new organism, with no edit button, once the organism is frozen", async () => {
      getStageMock.mockResolvedValue(draft({ organism: { ...draft().organism, editable: false } }));
      renderPage();

      await screen.findByText("Hôpital Cochin");

      expect(screen.queryByRole("button", { name: /modifier l'organisme/i })).toBeNull();
      expect(screen.getByText(/utilisé par d'autres demandes/i)).toBeVisible();

      // The way out is the same inline-creation sub-step as for a new draft.
      await userEvent.setup().click(screen.getByRole("button", { name: /changer d'organisme/i }));
      expect(screen.getByRole("button", { name: /créer un nouvel organisme/i })).toBeVisible();
    });

    it("steers to creating a new tutor, with no edit button, once the tutor is frozen", async () => {
      getStageMock.mockResolvedValue(draft({ tutor: { ...draft().tutor, editable: false } }));
      renderPage();

      await screen.findByText("Hôpital Cochin");

      await screen.findByText(/marie curie/i);
      expect(screen.queryByRole("button", { name: /modifier le tuteur/i })).toBeNull();
      expect(screen.getByText(/ce tuteur est utilisé par d'autres demandes/i)).toBeVisible();
    });

    it("explains a frozen row refused by the server (a race) with the server's own message", async () => {
      const user = userEvent.setup();
      updateStageDraftMock.mockRejectedValue(
        conflictError("STAGE_ROW_FROZEN", "Cet organisme est utilisé par d'autres demandes."),
      );
      renderPage();

      await walkToRecap(user);
      await saveDraft(user);

      expect(
        await screen.findByText(/cet organisme est utilisé par d'autres demandes/i),
      ).toBeVisible();
      expect(screen.queryByRole("button", { name: /recharger/i })).toBeNull();
    });
  });

  describe("what cannot be edited", () => {
    it.each(["PENDING", "VALIDATED", "REFUSED"] as const)(
      "opens no wizard on a %s request, and points back to it",
      async (status) => {
        getStageMock.mockResolvedValue(draft({ status }));
        renderPage();

        expect(await screen.findByText(/seul un brouillon peut être modifié/i)).toBeVisible();
        expect(screen.queryByRole("button", { name: /suivant/i })).toBeNull();
        expect(screen.getByRole("link", { name: /mes demandes/i })).toHaveAttribute(
          "href",
          "/stages",
        );
      },
    );

    it("says the request is not found on a 404", async () => {
      getStageMock.mockRejectedValue(new ApiError(404, "Not found"));
      renderPage();

      expect(await screen.findByText(/demande introuvable/i)).toBeVisible();
    });
  });
});
