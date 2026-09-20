import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { StageDetailResponse } from "shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { StageDetailPage } from "./StageDetailPage";

const getStageMock = vi.fn();
vi.mock("./api", () => ({
  getStage: (...args: unknown[]) => getStageMock(...args),
}));

function stageDetail(overrides: Partial<StageDetailResponse> = {}): StageDetailResponse {
  return {
    id: "stage-1",
    status: "DRAFT",
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
      { id: "p2", startDate: "2025-11-03T00:00:00.000Z", endDate: "2025-11-07T00:00:00.000Z" },
    ],
    submittedAt: null,
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
