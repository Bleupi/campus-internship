import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { StageDetailResponse } from "shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { StageDetailPage } from "./StageDetailPage";

const getStageMock = vi.fn();
const submitStageMock = vi.fn();
const duplicateStageMock = vi.fn();
vi.mock("./api", () => ({
  getStage: (...args: unknown[]) => getStageMock(...args),
  submitStage: (...args: unknown[]) => submitStageMock(...args),
  duplicateStage: (...args: unknown[]) => duplicateStageMock(...args),
}));

const getProfileMock = vi.fn();
vi.mock("../students/api", () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
}));

function stageDetail(overrides: Partial<StageDetailResponse> = {}): StageDetailResponse {
  return {
    id: "stage-1",
    status: "DRAFT",
    version: 0,
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    service: "Cardiologie",
    projectType: "Handicap moteur",
    motivation: "Je souhaite découvrir le métier.",
    organism: {
      id: "org-1",
      name: "Hôpital Cochin",
      structureType: "Secteur Sanitaire",
      city: "Paris",
      postalCode: "75014",
      street: "27 Rue du Faubourg Saint-Jacques",
      editable: true,
    },
    tutor: {
      id: "tut-1",
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
      { id: "p2", startDate: "2025-11-03T00:00:00.000Z", endDate: "2025-11-07T00:00:00.000Z" },
    ],
    submittedAt: null,
    decidedAt: null,
    refusalReason: null,
    referent: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/stages/stage-1"]}>
        <Routes>
          <Route path="/stages/:id" element={<StageDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StageDetailPage (issue #114)", () => {
  beforeEach(() => {
    getProfileMock.mockResolvedValue({ profileStatus: "VALID" });
  });
  afterEach(() => vi.clearAllMocks());

  it("fetches the stage named in the URL and shows all its fields and every period", async () => {
    getStageMock.mockResolvedValue(stageDetail());
    renderPage();

    expect(await screen.findByText("Hôpital Cochin")).toBeInTheDocument();
    expect(getStageMock).toHaveBeenCalledWith("stage-1");
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByText(/Marie Curie/)).toBeInTheDocument();
    expect(screen.getByText("Cardiologie")).toBeInTheDocument();
    expect(screen.getByText("Handicap moteur")).toBeInTheDocument();
    expect(screen.getByText("Je souhaite découvrir le métier.")).toBeInTheDocument();
    expect(screen.getByText(/01\/10\/2025/)).toBeInTheDocument();
    expect(screen.getByText(/03\/11\/2025/)).toBeInTheDocument();
  });

  it("offers a DRAFT a 'Modifier' link to its edit page, and no other status (issue #116)", async () => {
    getStageMock.mockResolvedValue(stageDetail({ status: "DRAFT" }));
    const { unmount } = renderPage();

    const edit = await screen.findByRole("link", { name: /modifier/i });
    expect(edit).toHaveAttribute("href", "/stages/stage-1/edit");
    unmount();

    getStageMock.mockResolvedValue(stageDetail({ status: "PENDING" }));
    renderPage();
    await screen.findByText("Hôpital Cochin");
    expect(screen.queryByRole("link", { name: /modifier/i })).toBeNull();
  });

  it("groups 'Modifier' and 'Soumettre' in one labelled actions group, after the missing-field reasons (issue #116 QA)", async () => {
    getStageMock.mockResolvedValue(stageDetail({ service: null }));
    renderPage();

    const reason = await screen.findByText("Renseignez le service.");
    const group = screen.getByRole("group", { name: "Actions de la demande" });
    const edit = within(group).getByRole("link", { name: "Modifier la demande de stage" });
    expect(edit).toHaveAttribute("href", "/stages/stage-1/edit");
    expect(
      within(group).getByRole("button", { name: "Soumettre la demande de stage" }),
    ).toBeInTheDocument();

    // The reason sits above the buttons it explains, and "Modifier" is no
    // longer stranded in the page header.
    expect(reason.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const title = screen.getByRole("heading", { name: "Demande de stage" });
    expect(within(title.parentElement as HTMLElement).queryByRole("link")).toBeNull();
  });

  it("ties the disabled 'Soumettre' to the reasons it is blocked, for screen readers (issue #116 QA)", async () => {
    getStageMock.mockResolvedValue(stageDetail({ service: null }));
    renderPage();

    await screen.findByText("Renseignez le service.");
    expect(screen.getByRole("button", { name: /^soumettre/i })).toHaveAccessibleDescription(
      /Renseignez le service\./,
    );
  });

  it("explains when the referent of a DRAFT will be assigned, instead of 'non assigné'", async () => {
    getStageMock.mockResolvedValue(stageDetail({ status: "DRAFT", referent: null }));
    renderPage();

    expect(
      await screen.findByText(
        "Sera attribué lors de la soumission du stage ou par l'administrateur",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("non assigné")).not.toBeInTheDocument();
  });

  it("shows 'non assigné' for a PENDING stage with no referent yet", async () => {
    getStageMock.mockResolvedValue(stageDetail({ status: "PENDING", referent: null }));
    renderPage();

    expect(await screen.findByText("non assigné")).toBeInTheDocument();
  });

  it("shows the derived referent's name when one is assigned", async () => {
    getStageMock.mockResolvedValue(
      stageDetail({
        status: "PENDING",
        referent: { id: "r1", firstName: "Jean", lastName: "Valjean" },
      }),
    );
    renderPage();

    expect(await screen.findByText("Jean Valjean")).toBeInTheDocument();
    expect(screen.queryByText("non assigné")).not.toBeInTheDocument();
  });

  it("shows the submission date once the request has been submitted, and none for a draft", async () => {
    getStageMock.mockResolvedValue(
      stageDetail({ status: "PENDING", submittedAt: "2025-09-01T08:00:00.000Z" }),
    );
    const { unmount } = renderPage();
    expect(await screen.findByText("01/09/2025")).toBeInTheDocument();
    expect(screen.getByText("Date de soumission")).toBeInTheDocument();
    unmount();

    getStageMock.mockResolvedValue(stageDetail({ submittedAt: null }));
    renderPage();
    await screen.findByText("Hôpital Cochin");
    expect(screen.queryByText("Date de soumission")).not.toBeInTheDocument();
  });

  it("BR-08: shows a decided stage in full, as the API read it from its snapshot, with its decision date", async () => {
    getStageMock.mockResolvedValue(
      stageDetail({
        status: "VALIDATED",
        organism: { ...stageDetail().organism, editable: false },
        tutor: { ...stageDetail().tutor, editable: false },
        submittedAt: "2025-09-01T08:00:00.000Z",
        decidedAt: "2025-09-10T09:30:00.000Z",
        referent: { id: "ref-1", firstName: "Jean", lastName: "Valjean" },
      }),
    );
    renderPage();

    expect(await screen.findByText("Hôpital Cochin")).toBeInTheDocument();
    expect(screen.getByText("Marie Curie (Médecin)")).toBeInTheDocument();
    expect(screen.getByText("Période 2")).toBeInTheDocument();
    expect(screen.getByText("Jean Valjean")).toBeInTheDocument();
    expect(screen.getByText("Date de décision")).toBeInTheDocument();
    expect(screen.getByText("10/09/2025")).toBeInTheDocument();
    // A decided stage is read-only.
    expect(screen.queryByRole("link", { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Soumettre" })).not.toBeInTheDocument();
  });

  it("shows no decision date for a live stage", async () => {
    getStageMock.mockResolvedValue(stageDetail({ status: "PENDING" }));
    renderPage();

    await screen.findByText("Hôpital Cochin");
    expect(screen.queryByText("Date de décision")).not.toBeInTheDocument();
  });

  it("shows the refusal reason prominently for a REFUSED stage", async () => {
    getStageMock.mockResolvedValue(
      stageDetail({ status: "REFUSED", refusalReason: "Période hors année scolaire." }),
    );
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Période hors année scolaire.");
  });

  it.each(["DRAFT", "PENDING", "VALIDATED"] as const)(
    "shows no refusal reason for a %s stage",
    async (status) => {
      getStageMock.mockResolvedValue(stageDetail({ status, refusalReason: "stale reason" }));
      renderPage();

      await screen.findByText("Hôpital Cochin");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("stale reason")).not.toBeInTheDocument();
    },
  );

  it("shows a not-found message on a 404 (unknown or someone else's stage)", async () => {
    getStageMock.mockRejectedValue(new ApiError(404, "Demande de stage introuvable"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/demande introuvable/i);
  });

  it("shows a generic error on any other failure", async () => {
    getStageMock.mockRejectedValue(new ApiError(500, "boom"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de charger/i);
  });

  it("links back to the request list", async () => {
    getStageMock.mockResolvedValue(stageDetail());
    renderPage();

    expect(await screen.findByRole("link", { name: /mes demandes/i })).toHaveAttribute(
      "href",
      "/stages",
    );
  });
});

describe("StageDetailPage submission (issue #115)", () => {
  // The fixture periods are in October 2025: freeze only Date inside that
  // school year so the previous-year rule doesn't depend on the real clock.
  beforeEach(() => {
    getProfileMock.mockResolvedValue({ profileStatus: "VALID" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-11-01T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("disables 'Soumettre' with the school-year reason for a previous-year draft", async () => {
    vi.setSystemTime(new Date("2026-09-20T10:00:00.000Z"));
    getStageMock.mockResolvedValue(stageDetail());
    renderPage();

    expect(await screen.findByText(/demandes de l'année scolaire précédente/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /^soumettre/i })).toBeDisabled();
  });

  it("enables 'Soumettre' on a complete DRAFT with a VALID profile", async () => {
    getStageMock.mockResolvedValue(stageDetail());
    renderPage();

    const button = await screen.findByRole("button", { name: /^soumettre/i });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it.each(["INCOMPLETE", "PENDING_VALIDATION", "EXPIRED"])(
    "BR-02: disables 'Soumettre' and says the profile must be validated when it is %s",
    async (profileStatus) => {
      getProfileMock.mockResolvedValue({ profileStatus });
      getStageMock.mockResolvedValue(stageDetail());
      renderPage();

      expect(await screen.findByText(/profil de stage doit d'abord être validé/)).toBeVisible();
      expect(screen.getByRole("button", { name: /^soumettre/i })).toBeDisabled();
    },
  );

  it("disables 'Soumettre' and names each missing field of an incomplete draft", async () => {
    getStageMock.mockResolvedValue(stageDetail({ service: null, motivation: null }));
    renderPage();

    expect(await screen.findByText("Renseignez le service.")).toBeVisible();
    expect(screen.getByText("Renseignez votre motivation.")).toBeVisible();
    expect(screen.getByRole("button", { name: /^soumettre/i })).toBeDisabled();
  });

  it("keeps 'Soumettre' disabled, without a false reason, while the profile is still loading", async () => {
    getProfileMock.mockReturnValue(new Promise(() => {}));
    getStageMock.mockResolvedValue(stageDetail());
    renderPage();

    const button = await screen.findByRole("button", { name: /^soumettre/i });
    expect(button).toBeDisabled();
    expect(screen.queryByText(/profil de stage doit d'abord/)).not.toBeInTheDocument();
  });

  it("submits the stage, then shows it as submitted with no 'Soumettre' action left", async () => {
    getStageMock.mockResolvedValueOnce(stageDetail());
    getStageMock.mockResolvedValue(
      stageDetail({ status: "PENDING", submittedAt: "2025-09-05T08:00:00.000Z" }),
    );
    submitStageMock.mockResolvedValue(undefined);
    renderPage();

    const button = await screen.findByRole("button", { name: /^soumettre/i });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(submitStageMock).toHaveBeenCalledWith("stage-1");
    expect(await screen.findByText("En attente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^soumettre/i })).not.toBeInTheDocument();
  });

  it("shows a French explanation, not the raw response body, when the submission is refused", async () => {
    getStageMock.mockResolvedValue(stageDetail());
    submitStageMock.mockRejectedValue(
      new ApiError(409, '{"message":"Conflit","error":"Conflict","statusCode":409}'),
    );
    renderPage();

    const button = await screen.findByRole("button", { name: /^soumettre/i });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByText(/a déjà été soumise ou modifiée/)).toBeVisible();
    expect(screen.queryByText(/statusCode/)).not.toBeInTheDocument();
  });

  it.each(["PENDING", "VALIDATED", "REFUSED"] as const)(
    "offers no 'Soumettre' action on a %s stage",
    async (status) => {
      getStageMock.mockResolvedValue(stageDetail({ status }));
      renderPage();

      await screen.findByText("Hôpital Cochin");
      expect(screen.queryByRole("button", { name: /^soumettre/i })).not.toBeInTheDocument();
    },
  );

  describe("duplicating (issue #117)", () => {
    it.each(["DRAFT", "PENDING", "VALIDATED", "REFUSED"] as const)(
      "offers 'Dupliquer' on a %s stage",
      async (status) => {
        getStageMock.mockResolvedValue(stageDetail({ status }));
        renderPage();

        expect(
          await screen.findByRole("button", { name: "Dupliquer la demande de stage" }),
        ).toBeEnabled();
      },
    );

    it("duplicates the stage, then opens the new draft", async () => {
      const user = userEvent.setup();
      getStageMock.mockImplementation((id: string) =>
        Promise.resolve(
          id === "copy-1"
            ? stageDetail({ id: "copy-1", status: "DRAFT", service: "Copie" })
            : stageDetail({ status: "REFUSED", refusalReason: "Dates incompatibles" }),
        ),
      );
      duplicateStageMock.mockResolvedValue({ id: "copy-1" });
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Dupliquer la demande de stage" }),
      );

      expect(duplicateStageMock).toHaveBeenCalledWith("stage-1");
      expect(await screen.findByText("Copie")).toBeInTheDocument();
      expect(getStageMock).toHaveBeenCalledWith("copy-1");
      expect(screen.getByText("Brouillon")).toBeInTheDocument();
    });

    it("shows a French error and stays on the request when the duplication fails", async () => {
      const user = userEvent.setup();
      getStageMock.mockResolvedValue(stageDetail({ status: "PENDING" }));
      duplicateStageMock.mockRejectedValue(new ApiError(500, "boom"));
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Dupliquer la demande de stage" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être dupliquée/i);
      expect(screen.getByText("Hôpital Cochin")).toBeInTheDocument();
    });
  });
});
