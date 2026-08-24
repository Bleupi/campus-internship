import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const getMeMock = vi.fn();
const logoutMock = vi.fn();
vi.mock("./features/auth/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  logout: (...args: unknown[]) => logoutMock(...args),
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

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage logout button", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    logoutMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a 'Déconnexion' button once the user is authenticated", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    renderDashboard();

    expect(await screen.findByRole("button", { name: /déconnexion/i })).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("calls the logout API and navigates to /login when clicked", async () => {
    getMeMock.mockResolvedValue({ user: authenticatedUser });
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: /déconnexion/i }));

    expect(logoutMock).toHaveBeenCalled();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"));
  });
});
