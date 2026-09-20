import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { StageListItemResponse } from "shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "../../test/setup";
import { StagesListPage } from "./StagesListPage";

const listStagesMock = vi.fn();
vi.mock("./api", () => ({
  listStages: (...args: unknown[]) => listStagesMock(...args),
}));

function stageItem(overrides: Partial<StageListItemResponse> = {}): StageListItemResponse {
  return {
    id: "stage-1",
    status: "DRAFT",
    schoolYear: "2025-2026",
    semester: "S1",
    mandatory: true,
    organismName: "Hôpital Cochin",
    submittedAt: null,
    periods: [
      { id: "p1", startDate: "2025-10-01T00:00:00.000Z", endDate: "2025-10-15T00:00:00.000Z" },
    ],
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(initialEntry = "/stages") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <StagesListPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StagesListPage (issue #114)", () => {
  beforeEach(() => {
    listStagesMock.mockResolvedValue([
      stageItem(),
      stageItem({ id: "stage-2", status: "PENDING", organismName: "Fondation OVE" }),
    ]);
  });

  afterEach(() => {
    setMatchMedia(false);
    vi.clearAllMocks();
  });

  describe("desktop", () => {
    it("renders one row per request with a link to its own detail page", async () => {
      renderPage();

      const rows = await screen.findAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getByText("Hôpital Cochin")).toBeInTheDocument();
      expect(within(rows[0]!).getByText("Brouillon")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("En attente")).toBeInTheDocument();
      expect(within(rows[1]!).getByRole("link", { name: /voir le détail/i })).toHaveAttribute(
        "href",
        "/stages/stage-2",
      );
    });

    it("shows a placeholder instead of an organism name for a frozen stage (no live read, BR-08)", async () => {
      listStagesMock.mockResolvedValue([stageItem({ status: "VALIDATED", organismName: null })]);
      renderPage();

      expect(await screen.findByText("Organisme indisponible")).toBeInTheDocument();
    });

    it("shows an empty state with a way to create a request when there is none", async () => {
      listStagesMock.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText(/aucune demande de stage/i)).toBeInTheDocument();
    });

    it("shows an error message when the list can't be loaded", async () => {
      listStagesMock.mockRejectedValue(new Error("boom"));
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de charger/i);
    });
  });

  describe("mobile", () => {
    beforeEach(() => setMatchMedia(true));

    it("renders an accordion per request and none of them starts expanded", async () => {
      renderPage();

      const summaries = await screen.findAllByRole("button", { expanded: false });
      const accordionSummaries = summaries.filter((el) => el.hasAttribute("aria-expanded"));
      expect(accordionSummaries).toHaveLength(2);
      expect(screen.queryByRole("button", { expanded: true })).not.toBeInTheDocument();
    });

    it("expanding a request reveals a link to its full-page detail", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: /fondation ove/i }));

      expect(await screen.findByRole("link", { name: /voir le détail/i })).toHaveAttribute(
        "href",
        "/stages/stage-2",
      );
    });
  });

  describe("filters and sort", () => {
    it("queries with the default sort (nearest start date) and no filter", async () => {
      renderPage();

      await screen.findAllByRole("listitem");
      expect(listStagesMock).toHaveBeenCalledWith({ sort: "startDate" });
    });

    it("filtering by status refetches with it and records it in the URL", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("listitem");

      await user.click(screen.getByRole("button", { name: "En attente" }));

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "startDate", status: "PENDING" }),
      );
      expect(screen.getByTestId("location")).toHaveTextContent("status=PENDING");
    });

    it("filtering by semester refetches with it", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("listitem");

      await user.click(screen.getByRole("button", { name: "Semestre 2" }));

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "startDate", semester: "S2" }),
      );
    });

    it("choosing the submission-date sort refetches with it", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("listitem");

      await user.click(screen.getByLabelText(/trier par/i));
      await user.click(await screen.findByRole("option", { name: /date de soumission/i }));

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "submittedAt" }),
      );
    });

    it("restores filter and sort from the URL, so back from a detail page lands on the same view", async () => {
      renderPage("/stages?status=PENDING&semester=S2&sort=submittedAt");

      await screen.findAllByRole("listitem");
      expect(listStagesMock).toHaveBeenCalledWith({
        status: "PENDING",
        semester: "S2",
        sort: "submittedAt",
      });
      expect(screen.getByRole("button", { name: "En attente" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("ignores an invalid value in the URL instead of sending it to the API", async () => {
      renderPage("/stages?status=BOGUS&sort=nope");

      await screen.findAllByRole("listitem");
      expect(listStagesMock).toHaveBeenCalledWith({ sort: "startDate" });
    });
  });
});

// Issue #114 QA: matches the chosen prototype (variant C for mobile, action
// buttons on the side on desktop, "Nouvelle demande" always at the bottom so
// the call to action is in the same place in every state).
describe("StagesListPage prototype layout (issue #114)", () => {
  beforeEach(() => {
    listStagesMock.mockResolvedValue([
      stageItem(),
      stageItem({ id: "stage-2", status: "PENDING", organismName: "Fondation OVE" }),
    ]);
  });

  afterEach(() => {
    setMatchMedia(false);
    vi.clearAllMocks();
  });

  it("puts the 'Nouvelle demande' call to action after the list, not above it", async () => {
    renderPage();

    const rows = await screen.findAllByRole("listitem");
    const cta = screen.getByRole("link", { name: /nouvelle demande/i });
    expect(cta).toHaveAttribute("href", "/stages/new");
    expect(rows[rows.length - 1]!.compareDocumentPosition(cta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("keeps the call to action at the bottom on mobile and on an empty list", async () => {
    setMatchMedia(true);
    const { unmount } = renderPage();
    const firstAccordion = (await screen.findAllByRole("button", { expanded: false }))[0]!;
    expect(
      firstAccordion.compareDocumentPosition(
        screen.getByRole("link", { name: /nouvelle demande/i }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    unmount();

    setMatchMedia(false);
    listStagesMock.mockResolvedValue([]);
    renderPage();
    const empty = await screen.findByText(/aucune demande de stage/i);
    expect(
      empty.compareDocumentPosition(screen.getByRole("link", { name: /nouvelle demande/i })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("leads each desktop row with its status, then the organism, then its first period", async () => {
    renderPage();

    const row = (await screen.findAllByRole("listitem"))[0]!;
    const text = row.textContent ?? "";
    expect(text.indexOf("Brouillon")).toBeLessThan(text.indexOf("Hôpital Cochin"));
    expect(text.indexOf("Hôpital Cochin")).toBeLessThan(text.indexOf("01/10/2025"));
  });

  it("shows the period in the collapsed mobile row, before anything is expanded", async () => {
    setMatchMedia(true);
    renderPage();

    const summary = (await screen.findAllByRole("button", { expanded: false }))[0]!;
    expect(within(summary).getByText("Brouillon")).toBeInTheDocument();
    expect(within(summary).getByText("Hôpital Cochin")).toBeInTheDocument();
    expect(within(summary).getByText(/01\/10\/2025/)).toBeInTheDocument();
  });
});
