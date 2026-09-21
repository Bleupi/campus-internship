import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageRequestsPage } from "./StageRequestsPage";

const getStageRequestsMock = vi.fn();

vi.mock("./api", () => ({
  getStageRequests: (...args: unknown[]) => getStageRequestsMock(...args),
}));

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
  });

  it("renders the requests in the order the API returned them (already oldest submission first)", async () => {
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

  it("marks a mandatory stage 'Obligatoire' and a request without referent as not yet assigned", async () => {
    getStageRequestsMock.mockResolvedValue([request({ mandatory: true, referent: null })]);
    renderPage();

    const row = (await screen.findByText("Alice Martin")).closest("tr")!;
    expect(row).toHaveTextContent("Obligatoire");
    expect(row).toHaveTextContent("Aucun référent");
  });

  it("shows the structure type as a coloured label: same type, same colour; another type, another colour", async () => {
    getStageRequestsMock.mockResolvedValue([
      request({ id: "a", organism: { name: "Cochin", structureType: "Secteur Sanitaire" } }),
      request({ id: "b", organism: { name: "Bichat", structureType: "Secteur Sanitaire" } }),
      request({ id: "c", organism: { name: "Handisport", structureType: "Association" } }),
    ]);
    renderPage();

    await screen.findByText("Cochin");
    const [first, second, third] = bodyRows().map((row) => {
      const label = within(row).getByTestId("structure-type-label");
      return getComputedStyle(label).backgroundColor;
    });
    expect(first).not.toBe("");
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it("tabs Toutes / Sans référent / Prêtes à valider show their counts and filter the rows", async () => {
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
});
