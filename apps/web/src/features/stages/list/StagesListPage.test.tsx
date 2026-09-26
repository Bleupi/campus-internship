import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { StageListItemResponse } from "shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "../../../test/setup";
import { StagesListPage } from "./StagesListPage";

const listStagesMock = vi.fn();
const duplicateStageMock = vi.fn();
vi.mock("../api", () => ({
  listStages: (...args: unknown[]) => listStagesMock(...args),
  duplicateStage: (...args: unknown[]) => duplicateStageMock(...args),
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

async function dataRows() {
  const table = await screen.findByRole("table");
  // First row is the header.
  return within(table).getAllByRole("row").slice(1);
}

async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string,
  option: RegExp | string,
) {
  const group = screen.getByRole("group", { name: /filtres/i });
  await user.click(within(group).getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
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

  describe("desktop (table)", () => {
    it("renders a table with the location first, one row per request", async () => {
      renderPage();

      const table = await screen.findByRole("table");
      const headers = within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent);
      expect(headers).toEqual(["Organisme", "Statut", "Période", "Semestre", "Type", "Actions"]);

      const rows = await dataRows();
      expect(rows).toHaveLength(2);
      const cells = within(rows[0]!).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("Hôpital Cochin");
      expect(cells[1]).toHaveTextContent("Brouillon");
      expect(cells[2]).toHaveTextContent("01/10/2025 → 15/10/2025");
      expect(cells[3]).toHaveTextContent("Semestre 1");
      expect(cells[4]).toHaveTextContent("Obligatoire");
    });

    it("gives each row an eye icon button to its own detail page, not a text link", async () => {
      renderPage();

      const rows = await dataRows();
      const eye = within(rows[1]!).getByRole("link", { name: "Voir le détail" });
      expect(eye).toHaveAttribute("href", "/stages/stage-2");
      expect(within(rows[1]!).queryByText(/voir le détail/i)).not.toBeInTheDocument();
    });

    it("gives a DRAFT row a pen button to its edit page, and no other row", async () => {
      listStagesMock.mockResolvedValue([
        stageItem({ id: "draft-1", status: "DRAFT" }),
        stageItem({ id: "pending-1", status: "PENDING" }),
        stageItem({ id: "validated-1", status: "VALIDATED" }),
      ]);
      renderPage();

      const rows = await dataRows();
      const pen = within(rows[0]!).getByRole("link", { name: "Modifier la demande" });
      expect(pen).toHaveAttribute("href", "/stages/draft-1/edit");
      expect(within(rows[0]!).queryByText(/^modifier/i)).not.toBeInTheDocument();
      expect(within(rows[1]!).queryByRole("link", { name: "Modifier la demande" })).toBeNull();
      expect(within(rows[2]!).queryByRole("link", { name: "Modifier la demande" })).toBeNull();
    });

    it("notes the extra periods next to the first one", async () => {
      listStagesMock.mockResolvedValue([
        stageItem({
          periods: [
            { id: "a", startDate: "2025-10-01T00:00:00.000Z", endDate: "2025-10-15T00:00:00.000Z" },
            { id: "b", startDate: "2025-11-03T00:00:00.000Z", endDate: "2025-11-07T00:00:00.000Z" },
          ],
        }),
      ]);
      renderPage();

      const rows = await dataRows();
      expect(rows[0]).toHaveTextContent("01/10/2025 → 15/10/2025 (+1)");
    });

    it("BR-08: shows a decided stage's organism name, as the API read it from its snapshot", async () => {
      listStagesMock.mockResolvedValue([
        stageItem({ status: "REFUSED", organismName: "Hôpital Cochin" }),
      ]);
      renderPage();

      const rows = await dataRows();
      expect(rows[0]).toHaveTextContent("Hôpital Cochin");
      expect(screen.queryByText("Organisme indisponible")).not.toBeInTheDocument();
    });

    it("BR-08: shows a placeholder when a decided stage's snapshot could not be read (null organism name)", async () => {
      listStagesMock.mockResolvedValue([stageItem({ status: "VALIDATED", organismName: null })]);
      renderPage();

      expect(await screen.findByText("Organisme indisponible")).toBeInTheDocument();
    });

    it("gives every row a 'Dupliquer' icon button, whatever its status (issue #117)", async () => {
      listStagesMock.mockResolvedValue(
        (["DRAFT", "PENDING", "VALIDATED", "REFUSED"] as const).map((status) =>
          stageItem({ id: `${status}-1`, status }),
        ),
      );
      renderPage();

      const rows = await dataRows();
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(within(row).getByRole("button", { name: "Dupliquer la demande" })).toBeEnabled();
        expect(within(row).queryByText(/^dupliquer/i)).not.toBeInTheDocument();
      }
    });

    it("duplicates the row's request, and the new draft shows up in the list without leaving it (issue #117)", async () => {
      const user = userEvent.setup();
      const refused = stageItem({ id: "refused-1", status: "REFUSED" });
      listStagesMock.mockResolvedValueOnce([refused]);
      listStagesMock.mockResolvedValue([
        stageItem({ id: "copy-1", status: "DRAFT", organismName: "Copie de Cochin" }),
        refused,
      ]);
      duplicateStageMock.mockResolvedValue({ id: "copy-1" });
      renderPage();

      const rows = await dataRows();
      await user.click(within(rows[0]!).getByRole("button", { name: "Dupliquer la demande" }));

      expect(duplicateStageMock).toHaveBeenCalledWith("refused-1");
      expect(await screen.findByText("Copie de Cochin")).toBeInTheDocument();
      expect(await dataRows()).toHaveLength(2);
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/stages/);
    });

    it("says so when the duplication fails, and keeps the list (issue #117)", async () => {
      const user = userEvent.setup();
      duplicateStageMock.mockRejectedValue(new Error("boom"));
      renderPage();

      const rows = await dataRows();
      await user.click(within(rows[0]!).getByRole("button", { name: "Dupliquer la demande" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être dupliquée/i);
      expect(await dataRows()).toHaveLength(2);
    });

    it("shows an empty state instead of a table when there is no request", async () => {
      listStagesMock.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText(/aucune demande de stage/i)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows an error message when the list can't be loaded", async () => {
      listStagesMock.mockRejectedValue(new Error("boom"));
      renderPage();

      expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de charger/i);
    });
  });

  describe("mobile (accordion)", () => {
    beforeEach(() => setMatchMedia(true));

    it("renders an accordion per request, none expanded, and no table", async () => {
      renderPage();

      const summaries = (await screen.findAllByRole("button", { expanded: false })).filter((el) =>
        el.hasAttribute("aria-expanded"),
      );
      expect(summaries).toHaveLength(2);
      expect(screen.queryByRole("button", { expanded: true })).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("leads the collapsed row with the location, then status and first period", async () => {
      renderPage();

      const summary = (await screen.findAllByRole("button", { expanded: false }))[0]!;
      const text = summary.textContent ?? "";
      expect(text.indexOf("Hôpital Cochin")).toBeLessThan(text.indexOf("Brouillon"));
      expect(text).toContain("01/10/2025");
    });

    it("expanding a request reveals a labelled 'Voir le détail' button, not a bare icon", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: /fondation ove/i }));

      const link = await screen.findByRole("link", { name: "Voir le détail" });
      expect(link).toHaveAttribute("href", "/stages/stage-2");
      expect(within(link).getByText("Voir le détail")).toBeVisible();
    });
  });

  describe("mobile edit button", () => {
    beforeEach(() => setMatchMedia(true));

    it("reveals a labelled 'Modifier' button on an expanded DRAFT, next to 'Voir le détail'", async () => {
      const user = userEvent.setup();
      listStagesMock.mockResolvedValue([stageItem({ id: "draft-1", status: "DRAFT" })]);
      renderPage();

      await user.click(await screen.findByRole("button", { name: /hôpital cochin/i }));

      const edit = await screen.findByRole("link", { name: "Modifier" });
      expect(edit).toHaveAttribute("href", "/stages/draft-1/edit");
      expect(within(edit).getByText("Modifier")).toBeVisible();
      expect(screen.getByRole("link", { name: "Voir le détail" })).toBeVisible();
    });

    it("offers no edit button on a request that is not a DRAFT", async () => {
      const user = userEvent.setup();
      listStagesMock.mockResolvedValue([stageItem({ id: "pending-1", status: "PENDING" })]);
      renderPage();

      await user.click(await screen.findByRole("button", { name: /hôpital cochin/i }));

      await screen.findByRole("link", { name: "Voir le détail" });
      expect(screen.queryByRole("link", { name: "Modifier" })).toBeNull();
    });
  });

  describe("mobile duplicate button (issue #117)", () => {
    beforeEach(() => setMatchMedia(true));

    it.each(["DRAFT", "PENDING", "VALIDATED", "REFUSED"] as const)(
      "reveals a labelled 'Dupliquer' button on an expanded %s request",
      async (status) => {
        const user = userEvent.setup();
        listStagesMock.mockResolvedValue([stageItem({ id: `${status}-1`, status })]);
        renderPage();

        await user.click(await screen.findByRole("button", { name: /hôpital cochin/i }));

        const duplicate = await screen.findByRole("button", { name: "Dupliquer" });
        expect(duplicate).toBeEnabled();
        expect(within(duplicate).getByText("Dupliquer")).toBeVisible();
      },
    );

    it("duplicates the request, and the new draft shows up in the list without leaving it", async () => {
      const user = userEvent.setup();
      const refused = stageItem({ id: "refused-1", status: "REFUSED" });
      listStagesMock.mockResolvedValueOnce([refused]);
      listStagesMock.mockResolvedValue([
        stageItem({ id: "copy-1", status: "DRAFT", organismName: "Copie de Cochin" }),
        refused,
      ]);
      duplicateStageMock.mockResolvedValue({ id: "copy-1" });
      renderPage();

      await user.click(await screen.findByRole("button", { name: /hôpital cochin/i }));
      await user.click(await screen.findByRole("button", { name: "Dupliquer" }));

      expect(duplicateStageMock).toHaveBeenCalledWith("refused-1");
      expect(await screen.findByText("Copie de Cochin")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/stages/);
    });

    it("says so when the duplication fails", async () => {
      const user = userEvent.setup();
      duplicateStageMock.mockRejectedValue(new Error("boom"));
      renderPage();

      await user.click(await screen.findByRole("button", { name: /hôpital cochin/i }));
      await user.click(await screen.findByRole("button", { name: "Dupliquer" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être dupliquée/i);
    });
  });

  describe("filters and sort", () => {
    it("groups status, semester and sort together, as dropdowns, above the list", async () => {
      renderPage();

      const group = screen.getByRole("group", { name: /filtres/i });
      expect(within(group).getByLabelText("Statut")).toBeInTheDocument();
      expect(within(group).getByLabelText("Semestre")).toBeInTheDocument();
      expect(within(group).getByLabelText("Trier par")).toBeInTheDocument();
      // Dropdowns, not toggle buttons.
      expect(screen.queryByRole("button", { name: "Brouillon" })).not.toBeInTheDocument();
      await screen.findByRole("table");
      expect(group.compareDocumentPosition(screen.getByRole("table"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("queries with the default sort (nearest start date) and no filter", async () => {
      renderPage();

      await dataRows();
      expect(listStagesMock).toHaveBeenCalledWith({ sort: "startDate" });
    });

    it("filtering by status refetches with it and records it in the URL", async () => {
      const user = userEvent.setup();
      renderPage();
      await dataRows();

      await pickOption(user, "Statut", "En attente");

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "startDate", status: "PENDING" }),
      );
      expect(screen.getByTestId("location")).toHaveTextContent("status=PENDING");
    });

    it("filtering by semester refetches with it", async () => {
      const user = userEvent.setup();
      renderPage();
      await dataRows();

      await pickOption(user, "Semestre", "Semestre 2");

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "startDate", semester: "S2" }),
      );
    });

    it("picking 'Tous' clears a filter", async () => {
      const user = userEvent.setup();
      renderPage("/stages?status=PENDING");
      await dataRows();

      await pickOption(user, "Statut", "Tous");

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "startDate" }),
      );
    });

    it("choosing the submission-date sort refetches with it", async () => {
      const user = userEvent.setup();
      renderPage();
      await dataRows();

      await pickOption(user, "Trier par", /date de soumission/i);

      await vi.waitFor(() =>
        expect(listStagesMock).toHaveBeenLastCalledWith({ sort: "submittedAt" }),
      );
    });

    it("restores filter and sort from the URL, so back from a detail page lands on the same view", async () => {
      renderPage("/stages?status=PENDING&semester=S2&sort=submittedAt");

      await dataRows();
      expect(listStagesMock).toHaveBeenCalledWith({
        status: "PENDING",
        semester: "S2",
        sort: "submittedAt",
      });
      const group = screen.getByRole("group", { name: /filtres/i });
      expect(within(group).getByLabelText("Statut")).toHaveTextContent("En attente");
      expect(within(group).getByLabelText("Semestre")).toHaveTextContent("Semestre 2");
    });

    it("ignores an invalid value in the URL instead of sending it to the API", async () => {
      renderPage("/stages?status=BOGUS&sort=nope");

      await dataRows();
      expect(listStagesMock).toHaveBeenCalledWith({ sort: "startDate" });
    });
  });

  describe("call to action", () => {
    it("sits after the list, never above it", async () => {
      renderPage();

      const table = await screen.findByRole("table");
      const cta = screen.getByRole("link", { name: /nouvelle demande/i });
      expect(cta).toHaveAttribute("href", "/stages/new");
      expect(table.compareDocumentPosition(cta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("stays at the bottom on mobile and on an empty list", async () => {
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
  });
});
