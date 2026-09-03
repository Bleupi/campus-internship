import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupPage } from "./SignupPage";
import { ApiError } from "../../lib/api-client";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const signupMock = vi.fn();
vi.mock("./api", () => ({
  signup: (...args: unknown[]) => signupMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "etu.dupont@etu.u-paris.fr");
  await user.type(screen.getByLabelText(/mot de passe/i), "un-mot-de-passe-bien-assez-long");
  await user.type(screen.getByLabelText(/prénom/i), "Étu");
  await user.type(screen.getByLabelText("Nom"), "Dupont");
}

describe("SignupPage", () => {
  beforeEach(() => {
    signupMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error for a non-@etu.u-paris.fr email without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "etu@gmail.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "un-mot-de-passe-bien-assez-long");
    await user.type(screen.getByLabelText(/prénom/i), "Étu");
    await user.type(screen.getByLabelText("Nom"), "Dupont");
    await user.click(screen.getByRole("button", { name: /s'inscrire/i }));

    expect(await screen.findByText(/etu\.u-paris\.fr/i)).toBeInTheDocument();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it("submits successfully and navigates to /dashboard", async () => {
    signupMock.mockResolvedValue({ user: { id: "1", email: "etu.dupont@etu.u-paris.fr" } });
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /s'inscrire/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("surfaces a 409 (email already taken) as a server error message", async () => {
    signupMock.mockRejectedValue(
      new ApiError(409, "Un compte existe déjà avec cette adresse email"),
    );
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /s'inscrire/i }));

    expect(await screen.findByText(/existe déjà/i)).toBeInTheDocument();
  });
});
