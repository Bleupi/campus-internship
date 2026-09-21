import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// Pinned off: these tests cover the legacy dashboard routing, and must not
// depend on the VITE_FEATURE_STAGE_MANAGEMENT value of the local .env (the flag-on
// default page is covered in App.home.test.tsx).
vi.mock("./lib/feature-flags", () => ({ isStageManagementEnabled: false }));

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

const getCertificateQueueMock = vi.fn();
vi.mock("./features/admin/api", () => ({
  getCertificateQueue: (...args: unknown[]) => getCertificateQueueMock(...args),
}));

const authenticatedUser = {
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

describe("App route protection", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    getProfileMock.mockReset();
    getCertificateQueueMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the authenticated shell around /dashboard once the user is loaded", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    getProfileMock.mockResolvedValue(studentProfile("VALID"));
    renderApp("/dashboard");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profil/i })).toBeInTheDocument();
  });

  it("redirects to /login without flashing the shell when the user isn't authenticated", async () => {
    getMeMock.mockRejectedValue(new Error("unauthenticated"));
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: /se connecter/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /profil/i })).not.toBeInTheDocument();
  });
});

describe("App route protection — BR-06 profile-completion guard", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    getProfileMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["INCOMPLETE", "EXPIRED"])(
    "redirects /dashboard to /profile when the student's profile is %s",
    async (profileStatus) => {
      getMeMock.mockResolvedValue({ user: authenticatedUser });
      getProfileMock.mockResolvedValue(studentProfile(profileStatus));
      renderApp("/dashboard");

      expect(await screen.findByRole("heading", { name: /mon profil/i })).toBeInTheDocument();
      expect(screen.queryByText(/tableau de bord \(à venir\)/i)).not.toBeInTheDocument();
    },
  );

  it("lets a blocked student reach /profile directly (it's the escape hatch)", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    getProfileMock.mockResolvedValue(studentProfile("INCOMPLETE"));
    renderApp("/profile");

    expect(await screen.findByRole("heading", { name: /mon profil/i })).toBeInTheDocument();
  });

  it("does not redirect a VALID student away from /dashboard", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    getProfileMock.mockResolvedValue(studentProfile("VALID"));
    renderApp("/dashboard");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
  });

  it("fails closed (blocks) rather than open when the profile fetch errors", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    getProfileMock.mockRejectedValue(new Error("network error"));
    renderApp("/dashboard");

    // Redirected off /dashboard onto /profile, which then shows its own
    // (equally errored) load failure rather than ever rendering the shell.
    expect(await screen.findByText(/impossible de charger le profil/i)).toBeInTheDocument();
    expect(screen.queryByText(/tableau de bord \(à venir\)/i)).not.toBeInTheDocument();
  });

  it("never calls the student-profile endpoint for a non-student role", async () => {
    getMeMock.mockResolvedValue({
      user: { ...authenticatedUser, roles: ["ADMIN"] },
    });
    renderApp("/dashboard");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
    expect(getProfileMock).not.toHaveBeenCalled();
  });
});

describe("Stage management flag off — issue #146 admin stage requests", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    getProfileMock.mockReset();
  });

  it("has no menu entry for an ADMIN", async () => {
    getMeMock.mockResolvedValue({ user: { ...authenticatedUser, roles: ["ADMIN"] } });
    renderApp("/dashboard");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /demandes à traiter/i })).not.toBeInTheDocument();
  });

  it("has no /admin/stage-requests route for an ADMIN", async () => {
    getMeMock.mockResolvedValue({ user: { ...authenticatedUser, roles: ["ADMIN"] } });
    renderApp("/admin/stage-requests");

    // Unmatched path: the catch-all sends it to /login instead of the page.
    expect(await screen.findByText(/s'inscrire/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /demandes à traiter/i })).not.toBeInTheDocument();
  });
});

describe("App route protection — issue #42 admin certificate queue", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    getProfileMock.mockReset();
    getCertificateQueueMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a non-ADMIN user away from /admin/certificate-queue", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    getProfileMock.mockResolvedValue(studentProfile("VALID"));
    renderApp("/admin/certificate-queue");

    expect(await screen.findByText(/tableau de bord \(à venir\)/i)).toBeInTheDocument();
    expect(getCertificateQueueMock).not.toHaveBeenCalled();
  });

  it("renders the certificate queue for an ADMIN user at /admin/certificate-queue", async () => {
    getMeMock.mockResolvedValue({ user: { ...authenticatedUser, roles: ["ADMIN"] } });
    getCertificateQueueMock.mockResolvedValue([]);
    renderApp("/admin/certificate-queue");

    expect(
      await screen.findByRole("heading", { name: /certificats à valider/i }),
    ).toBeInTheDocument();
  });
});
