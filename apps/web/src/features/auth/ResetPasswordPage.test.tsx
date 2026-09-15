import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { ApiError } from "../../lib/api-client";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const resetPasswordMock = vi.fn();
vi.mock("./api", () => ({
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

function renderPage(search = "?token=valid-token") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    resetPasswordMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error for a too-short password without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), "short");
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

    expect(await screen.findByText(/at least 18 character/i)).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("submits the token from the query string with the new password and redirects to /login on success", async () => {
    resetPasswordMock.mockResolvedValue({ message: "Mot de passe réinitialisé." });
    const user = userEvent.setup();
    renderPage("?token=valid-token");

    await user.type(
      screen.getByLabelText(/nouveau mot de passe/i),
      "a-perfectly-valid-password-123",
    );
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

    await waitFor(() =>
      expect(resetPasswordMock.mock.calls[0]?.[0]).toEqual({
        token: "valid-token",
        newPassword: "a-perfectly-valid-password-123",
      }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/login",
        expect.objectContaining({
          state: expect.objectContaining({ successMessage: expect.any(String) }),
        }),
      ),
    );
  });

  it("shows a generic error on an invalid/expired/used token, without ever logging the user in", async () => {
    resetPasswordMock.mockRejectedValue(new ApiError(400, "Token invalide ou expiré"));
    const user = userEvent.setup();
    renderPage("?token=bad-token");

    await user.type(
      screen.getByLabelText(/nouveau mot de passe/i),
      "a-perfectly-valid-password-123",
    );
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

    expect(await screen.findByText(/lien.*invalide|invalide.*lien/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a distinct fallback error (not the invalid-link message) on a non-token failure like a 500 or network error", async () => {
    resetPasswordMock.mockRejectedValue(new ApiError(500, "Internal server error"));
    const user = userEvent.setup();
    renderPage("?token=valid-token");

    await user.type(
      screen.getByLabelText(/nouveau mot de passe/i),
      "a-perfectly-valid-password-123",
    );
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument();
    expect(screen.queryByText(/lien.*invalide|invalide.*lien/i)).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('always shows a "Retour à la connexion" link back to /login', () => {
    renderPage("?token=valid-token");

    const link = screen.getByRole("link", { name: /retour à la connexion/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows a generic error and a way back to /login when the token is missing from the query string", () => {
    renderPage("");

    expect(screen.getByText(/lien.*invalide|invalide.*lien/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retour à la connexion/i })).toBeInTheDocument();
  });
});
