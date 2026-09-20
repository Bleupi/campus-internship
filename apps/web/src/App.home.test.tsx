import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// Issue #114 QA: with stage management on, "Mes demandes" is a student's
// default page instead of the dashboard placeholder.
vi.mock("./lib/feature-flags", () => ({ isStageManagementEnabled: true }));

const getMeMock = vi.fn();
vi.mock("./features/auth/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  logout: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
}));

const getProfileMock = vi.fn();
vi.mock("./features/students/api", () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
  updateProfile: vi.fn(),
  uploadIdPhoto: vi.fn(),
  uploadInsuranceCertificate: vi.fn(),
}));

const listStagesMock = vi.fn();
vi.mock("./features/stages/api", () => ({
  listStages: (...args: unknown[]) => listStagesMock(...args),
  getStage: vi.fn(),
  createStageDraft: vi.fn(),
}));

const student = {
  id: "1",
  email: "etu@etu.u-paris.fr",
  firstName: "Étu",
  lastName: "Dupont",
  roles: ["STUDENT"],
};

function studentProfile(profileStatus: string) {
  return {
    promotion: "L2",
    phone: null,
    personalEmail: null,
    profileStatus,
    profileYear: "2024-2025",
    files: [],
  };
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App default page with stage management on (issue #114)", () => {
  beforeEach(() => {
    listStagesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lands a VALID student on their request list instead of the dashboard", async () => {
    getMeMock.mockResolvedValue({ user: student });
    getProfileMock.mockResolvedValue(studentProfile("VALID"));
    renderApp("/dashboard");

    expect(
      await screen.findByRole("heading", { name: /mes demandes de stage/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tableau de bord \(à venir\)/i)).not.toBeInTheDocument();
  });

  // A refused certificate sends the profile back to INCOMPLETE (ADR-0004), so
  // "incomplete / refused / expired" are two blocking statuses in practice.
  it.each(["INCOMPLETE", "EXPIRED"])(
    "still sends a student whose profile is %s to /profile first (BR-06)",
    async (profileStatus) => {
      getMeMock.mockResolvedValue({ user: student });
      getProfileMock.mockResolvedValue(studentProfile(profileStatus));
      renderApp("/dashboard");

      expect(await screen.findByRole("heading", { name: /mon profil/i })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /mes demandes de stage/i })).toBeNull();
    },
  );

  it("does not block a student whose certificate is awaiting validation", async () => {
    getMeMock.mockResolvedValue({ user: student });
    getProfileMock.mockResolvedValue(studentProfile("PENDING_VALIDATION"));
    renderApp("/dashboard");

    expect(
      await screen.findByRole("heading", { name: /mes demandes de stage/i }),
    ).toBeInTheDocument();
  });

  it("keeps the dashboard for a user who is not a student", async () => {
    getMeMock.mockResolvedValue({ user: { ...student, roles: ["ADMIN"] } });
    renderApp("/dashboard");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
    expect(listStagesMock).not.toHaveBeenCalled();
  });
});
