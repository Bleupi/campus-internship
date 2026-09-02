import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-client";
import { CertificateQueuePage } from "./CertificateQueuePage";

const getCertificateQueueMock = vi.fn();
const getCertificateMock = vi.fn();
const validateProfileMock = vi.fn();
const rejectProfileMock = vi.fn();

vi.mock("./api", () => ({
  getCertificateQueue: (...args: unknown[]) => getCertificateQueueMock(...args),
  getCertificate: (...args: unknown[]) => getCertificateMock(...args),
  validateProfile: (...args: unknown[]) => validateProfileMock(...args),
  rejectProfile: (...args: unknown[]) => rejectProfileMock(...args),
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
    getCertificateMock.mockReset();
    validateProfileMock.mockReset();
    rejectProfileMock.mockReset();
    getCertificateMock.mockResolvedValue(new Blob(["pdf-bytes"], { type: "application/pdf" }));
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

  it("fetches and renders the certificate inline via a Blob object URL when a student with a certificate is selected", async () => {
    getCertificateQueueMock.mockResolvedValue([entry()]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));

    await waitFor(() => expect(getCertificateMock).toHaveBeenCalledWith("student-1"));
    const viewer = await screen.findByTitle(/aperçu du certificat/i);
    expect(viewer).toHaveAttribute("src", "blob:mock-url");
  });

  it("does not fetch a certificate when the selected student has none", async () => {
    getCertificateQueueMock.mockResolvedValue([entry({ certificate: null })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));

    expect(getCertificateMock).not.toHaveBeenCalled();
  });

  describe("Refuser button — disabled until a canned reason is checked or free text is entered", () => {
    async function selectAlice() {
      getCertificateQueueMock.mockResolvedValue([entry()]);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: /alice martin/i }));
      return user;
    }

    it("is disabled with no reason checked and no free text", async () => {
      await selectAlice();
      expect(await screen.findByRole("button", { name: /^refuser$/i })).toBeDisabled();
    });

    it("enables once a canned reason is checked", async () => {
      const user = await selectAlice();
      await user.click((await screen.findAllByRole("checkbox"))[0]!);
      expect(screen.getByRole("button", { name: /^refuser$/i })).toBeEnabled();
    });

    it("enables once free text is entered, even with no checkbox checked", async () => {
      const user = await selectAlice();
      await user.type(screen.getByRole("textbox", { name: /précision/i }), "Photo floue");
      expect(screen.getByRole("button", { name: /^refuser$/i })).toBeEnabled();
    });
  });

  it("Valider: calls validateProfile and auto-advances the right pane to the next student", async () => {
    getCertificateQueueMock
      .mockResolvedValueOnce([
        entry({ studentId: "s1", firstName: "Alice", lastName: "Martin" }),
        entry({ studentId: "s2", firstName: "Bob", lastName: "Durand" }),
      ])
      .mockResolvedValue([entry({ studentId: "s2", firstName: "Bob", lastName: "Durand" })]);
    validateProfileMock.mockResolvedValue({ studentId: "s1", profileStatus: "VALID" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));
    await user.click(screen.getByRole("button", { name: /^valider$/i }));

    expect(validateProfileMock).toHaveBeenCalledWith("s1");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Bob Durand" })).toBeInTheDocument(),
    );
    expect(within(screen.getByRole("list")).queryByText(/alice martin/i)).not.toBeInTheDocument();
  });

  it("Refuser: submits the concatenated reason (bulleted canned reasons + trailing free-text line)", async () => {
    getCertificateQueueMock.mockResolvedValue([entry()]);
    rejectProfileMock.mockResolvedValue({ studentId: "student-1", profileStatus: "INCOMPLETE" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));
    const checkboxes = await screen.findAllByRole("checkbox");
    await user.click(checkboxes[0]!);
    await user.type(screen.getByRole("textbox", { name: /précision/i }), "Photo floue");
    await user.click(screen.getByRole("button", { name: /^refuser$/i }));

    await waitFor(() => expect(rejectProfileMock).toHaveBeenCalledTimes(1));
    const [studentId, reason] = rejectProfileMock.mock.calls[0]!;
    expect(studentId).toBe("student-1");
    expect(reason).toMatch(/^- .+\nAutre précision : Photo floue$/);
  });

  it("shows a non-blocking toast and removes the row on a 409 (already processed by another admin)", async () => {
    getCertificateQueueMock.mockResolvedValueOnce([entry()]).mockResolvedValue([]);
    validateProfileMock.mockRejectedValue(new ApiError(409, "conflict"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /alice martin/i }));
    await user.click(screen.getByRole("button", { name: /^valider$/i }));

    expect(await screen.findByText(/déjà traité par un autre administrateur/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/aucun certificat en attente/i)).toBeInTheDocument(),
    );
  });
});
