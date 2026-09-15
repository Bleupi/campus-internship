import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

const forgotPasswordMock = vi.fn();
vi.mock("./api", () => ({
  forgotPassword: (...args: unknown[]) => forgotPasswordMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    forgotPasswordMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error for a malformed email without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(forgotPasswordMock).not.toHaveBeenCalled();
  });

  it("shows the identical generic success message for a registered email (BR-13)", async () => {
    forgotPasswordMock.mockResolvedValue({
      message: "Si un compte existe, un email a été envoyé.",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "connu@etu.u-paris.fr");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(
      await screen.findByText(/si un compte existe, un email a été envoyé/i),
    ).toBeInTheDocument();
  });

  it("shows the identical generic success message for an unregistered email (BR-13)", async () => {
    forgotPasswordMock.mockResolvedValue({
      message: "Si un compte existe, un email a été envoyé.",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "inconnu@etu.u-paris.fr");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(
      await screen.findByText(/si un compte existe, un email a été envoyé/i),
    ).toBeInTheDocument();
  });
});
