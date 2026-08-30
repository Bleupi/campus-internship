import { render, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "../test/setup";
import { AppShell } from "./AppShell";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const logoutMock = vi.fn();
vi.mock("../features/auth/api", () => ({
  logout: (...args: unknown[]) => logoutMock(...args),
}));

function renderShell(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<div>Contenu tableau de bord</div>} />
            <Route path="/profile" element={<div>Contenu profil</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the nav links and a logout button", () => {
    renderShell("/dashboard");

    expect(screen.getByRole("link", { name: /tableau de bord/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profil/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /déconnexion/i })).toBeInTheDocument();
  });

  it("renders the active route's page content via the outlet", () => {
    renderShell("/profile");

    expect(screen.getByText("Contenu profil")).toBeInTheDocument();
  });

  it("marks the active nav link with aria-current", () => {
    renderShell("/profile");

    expect(screen.getByRole("link", { name: /profil/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /tableau de bord/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("visually distinguishes the active nav link from inactive ones", () => {
    renderShell("/profile");

    expect(screen.getByRole("link", { name: /profil/i })).toHaveStyle({ fontWeight: "700" });
    expect(screen.getByRole("link", { name: /tableau de bord/i })).toHaveStyle({
      fontWeight: "400",
    });
  });

  it("calls the logout API and navigates to /login when clicked", async () => {
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderShell("/dashboard");

    await user.click(screen.getByRole("button", { name: /déconnexion/i }));

    expect(logoutMock).toHaveBeenCalled();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"));
  });

  describe("on mobile viewports", () => {
    beforeEach(() => {
      setMatchMedia(true);
    });

    it("shows a menu button instead of the inline nav row", () => {
      renderShell("/dashboard");

      expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /profil/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /déconnexion/i })).not.toBeInTheDocument();
    });

    it("opens a drawer with the nav links and logout when the menu button is clicked", async () => {
      const user = userEvent.setup();
      renderShell("/dashboard");

      await user.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

      expect(screen.getByRole("link", { name: /tableau de bord/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /profil/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /déconnexion/i })).toBeInTheDocument();
    });

    it("closes the drawer after clicking a nav link", async () => {
      const user = userEvent.setup();
      renderShell("/dashboard");

      await user.click(screen.getByRole("button", { name: /ouvrir le menu/i }));
      await user.click(screen.getByRole("link", { name: /profil/i }));

      await waitForElementToBeRemoved(() => screen.queryByRole("link", { name: /profil/i }));
    });

    it("calls the logout API and closes the drawer when the drawer's logout item is clicked", async () => {
      logoutMock.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderShell("/dashboard");

      await user.click(screen.getByRole("button", { name: /ouvrir le menu/i }));
      await user.click(screen.getByRole("button", { name: /déconnexion/i }));

      expect(logoutMock).toHaveBeenCalled();
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"));
      await waitForElementToBeRemoved(() => screen.queryByRole("button", { name: /déconnexion/i }));
    });
  });
});
