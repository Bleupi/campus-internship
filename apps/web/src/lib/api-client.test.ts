import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError } from "./api-client";

function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("apiClient 401-retry-once interceptor", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("on a 401, calls /auth/refresh once and retries the original request", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }, false)) // original call
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "1" } })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retried original call

    const result = await apiClient.get<{ ok: boolean }>("/students/me");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = fetchMock.mock.calls[1]!;
    expect(String(refreshCall[0])).toContain("/auth/refresh");
  });

  it("dedupes concurrent 401s to a single /auth/refresh call", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}, false)) // request A original
      .mockResolvedValueOnce(jsonResponse(401, {}, false)) // request B original
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "1" } })) // /auth/refresh (shared)
      .mockResolvedValueOnce(jsonResponse(200, { from: "A" })) // request A retry
      .mockResolvedValueOnce(jsonResponse(200, { from: "B" })); // request B retry

    const [a, b] = await Promise.all([
      apiClient.get<{ from: string }>("/a"),
      apiClient.get<{ from: string }>("/b"),
    ]);

    expect(a).toEqual({ from: "A" });
    expect(b).toEqual({ from: "B" });

    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("surfaces the original 401 when the refresh itself fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }, false)) // original call
      .mockResolvedValueOnce(jsonResponse(401, { message: "no session" }, false)); // /auth/refresh fails

    await expect(apiClient.get("/students/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not attempt a refresh loop when /auth/login itself returns 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "bad credentials" }, false));

    await expect(
      apiClient.post("/auth/login", { email: "a@u-paris.fr", password: "x" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
