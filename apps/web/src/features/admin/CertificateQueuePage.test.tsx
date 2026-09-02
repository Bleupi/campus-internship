import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateQueuePage } from "./CertificateQueuePage";

const getCertificateQueueMock = vi.fn();

vi.mock("./api", () => ({
  getCertificateQueue: (...args: unknown[]) => getCertificateQueueMock(...args),
}));

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    studentId: "student-1",
    firstName: "Alice",
    lastName: "Martin",
    promotion: "L3",
    waitingSince: "2026-08-01T00:00:00.000Z",
    certificate: { uploadedAt: "2026-07-15T00:00:00.000Z" },
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CertificateQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CertificateQueuePage", () => {
  beforeEach(() => {
    getCertificateQueueMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders every queue entry in the order it was returned (backend already sorts FIFO)", async () => {
    getCertificateQueueMock.mockResolvedValue([
      entry({ studentId: "s1", firstName: "Alice", lastName: "Martin" }),
      entry({ studentId: "s2", firstName: "Bob", lastName: "Durand" }),
    ]);
    renderPage();

    const rows = await screen.findAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Alice Martin"),
      expect.stringContaining("Bob Durand"),
    ]);
  });

  it("shows an empty-state message when the queue has no pending students", async () => {
    getCertificateQueueMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/aucun certificat en attente/i)).toBeInTheDocument();
  });

  it("shows a load-failure message when the query errors", async () => {
    getCertificateQueueMock.mockRejectedValue(new Error("network error"));
    renderPage();

    expect(await screen.findByText(/impossible de charger la file d'attente/i)).toBeInTheDocument();
  });

  it("shows a placeholder in the right pane until a student row is selected", async () => {
    getCertificateQueueMock.mockResolvedValue([entry()]);
    renderPage();

    await screen.findByRole("button", { name: /alice martin/i });
    expect(screen.getByText(/sélectionnez un étudiant/i)).toBeInTheDocument();
  });

  it("selects a row and shows student info, promotion and certificate metadata in the right pane", async () => {
    getCertificateQueueMock.mockResolvedValue([entry()]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));

    expect(screen.getByRole("heading", { name: "Alice Martin" })).toBeInTheDocument();
    expect(screen.getByText(/promotion : l3/i)).toBeInTheDocument();
    expect(screen.getByText(/envoyé le/i)).toBeInTheDocument();
  });

  it("reports the certificate as absent when the entry's certificate is null", async () => {
    getCertificateQueueMock.mockResolvedValue([entry({ certificate: null })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));

    expect(screen.getByText(/aucun certificat valide actuellement/i)).toBeInTheDocument();
  });
});
