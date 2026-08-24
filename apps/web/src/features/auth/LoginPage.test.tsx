import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { ApiError } from "../../lib/api-client";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const loginMock = vi.fn();
vi.mock("./api", () => ({
  login: (...args: unknown[]) => loginMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error for a malformed email without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/mot de passe/i), "whatever");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("submits successfully and navigates to /dashboard", async () => {
    loginMock.mockResolvedValue({ user: { id: "1", email: "etu@u-paris.fr" } });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "etu@u-paris.fr");
    await user.type(screen.getByLabelText(/mot de passe/i), "whatever-they-typed");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("surfaces a 401 as 'identifiants incorrects'", async () => {
    loginMock.mockRejectedValue(new ApiError(401, "Email ou mot de passe incorrect"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "etu@u-paris.fr");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByText(/identifiants incorrects/i)).toBeInTheDocument();
  });
});
