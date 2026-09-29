import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferentAssignmentsPage } from "./ReferentAssignmentsPage";

const getReferentAssignmentsMock = vi.fn();

vi.mock("../api", () => ({
  getReferentAssignments: (...args: unknown[]) => getReferentAssignmentsMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReferentAssignmentsPage />
    </QueryClientProvider>,
  );
}

describe("ReferentAssignmentsPage", () => {
  beforeEach(() => {
    getReferentAssignmentsMock.mockReset();
  });

  it("shows each referent next to the last name, first name and promotion of their students", async () => {
    getReferentAssignmentsMock.mockResolvedValue([
      {
        id: "ref-1",
        firstName: "Élodie",
        lastName: "Martin",
        students: [
          { id: "stu-1", firstName: "Alice", lastName: "Dupont", promotion: "L2" },
          { id: "stu-2", firstName: "Bob", lastName: "Durand", promotion: "L3" },
        ],
      },
    ]);

    renderPage();

    const group = await screen.findByRole("rowgroup", { name: "Élodie Martin" });
    const rows = within(group).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Élodie Martin")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Dupont")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Alice")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("L2")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Durand")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("L3")).toBeInTheDocument();
  });

  it("says so when a referent has no student, and when a student has no promotion yet", async () => {
    getReferentAssignmentsMock.mockResolvedValue([
      { id: "ref-1", firstName: "Paul", lastName: "Petit", students: [] },
      {
        id: "ref-2",
        firstName: "Léa",
        lastName: "Roux",
        students: [{ id: "stu-1", firstName: "Alice", lastName: "Dupont", promotion: null }],
      },
    ]);

    renderPage();

    const empty = await screen.findByRole("rowgroup", { name: "Paul Petit" });
    expect(within(empty).getByText("Aucun étudiant assigné")).toBeInTheDocument();
    const noPromotion = screen.getByRole("rowgroup", { name: "Léa Roux" });
    expect(within(noPromotion).getByText("Non renseignée")).toBeInTheDocument();
  });

  it("shows an error when the overview cannot be loaded", async () => {
    getReferentAssignmentsMock.mockRejectedValue(new Error("boom"));

    renderPage();

    expect(
      await screen.findByText("Impossible de charger les référents et leurs étudiants."),
    ).toBeInTheDocument();
  });
});
