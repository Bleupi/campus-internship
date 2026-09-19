import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const flags = vi.hoisted(() => ({ isStageManagementEnabled: true }));
vi.mock("../../lib/feature-flags", () => ({
  get isStageManagementEnabled() {
    return flags.isStageManagementEnabled;
  },
}));

const getMeMock = vi.fn();
vi.mock("../auth/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
}));

function user(roles: string[]) {
  return { id: "1", email: "u@u-paris.fr", firstName: "U", lastName: "Dupont", roles };
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

// The heading renders immediately, before getMe resolves — so an absence
// assertion made right after it would pass vacuously. Wait for the user query
// itself to settle first.
async function waitForUserLoaded(queryClient: QueryClient) {
  await waitFor(() => expect(getMeMock).toHaveBeenCalled());
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

describe("DashboardPage", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    flags.isStageManagementEnabled = true;
  });

  it("offers a 'Nouvelle demande' link to the wizard to a student when stage management is on", async () => {
    getMeMock.mockResolvedValue({ user: user(["STUDENT"]) });
    renderDashboard();

    const link = await screen.findByRole("link", { name: /nouvelle demande/i });
    expect(link).toHaveAttribute("href", "/stages/new");
  });

  it("hides the link while the stage-management feature flag is off", async () => {
    flags.isStageManagementEnabled = false;
    getMeMock.mockResolvedValue({ user: user(["STUDENT"]) });
    const queryClient = renderDashboard();

    await waitForUserLoaded(queryClient);
    expect(screen.queryByRole("link", { name: /nouvelle demande/i })).toBeNull();
  });

  it("hides the link from a non-student user", async () => {
    getMeMock.mockResolvedValue({ user: user(["ADMIN"]) });
    const queryClient = renderDashboard();

    await waitForUserLoaded(queryClient);
    expect(screen.queryByRole("link", { name: /nouvelle demande/i })).toBeNull();
  });
});
