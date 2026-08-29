import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const getMeMock = vi.fn();
vi.mock("./features/auth/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  logout: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
}));

const authenticatedUser = {
  id: "1",
  email: "etu@u-paris.fr",
  firstName: "Étu",
  lastName: "Dupont",
  roles: ["STUDENT"],
};

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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the authenticated shell around /dashboard once the user is loaded", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
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
