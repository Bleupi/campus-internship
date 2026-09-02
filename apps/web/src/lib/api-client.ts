import { z } from "zod";
import { readEnvVar } from "./env";

const API_BASE_URL = readEnvVar(
  import.meta.env.VITE_API_BASE_URL,
  "VITE_API_BASE_URL",
  z.string().url(),
);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Routes that must never trigger a refresh-and-retry themselves, or a 401
// from /auth/login (bad credentials) would spin into an infinite refresh loop.
const AUTH_ENDPOINTS_EXCLUDED_FROM_RETRY = ["/auth/login", "/auth/signup", "/auth/refresh"];

// Concurrent 401s share one in-flight refresh call instead of each firing
// their own (see ADR-0018) — module-level so every request() call sees it.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Shared by request() (JSON) and getBlob() (binary, e.g. issue #43's
// certificate stream) — both need the same 401-retry-once/credentials
// handling, only how the body is finally read differs.
async function fetchWithAuth(path: string, init?: RequestInit, isRetry = false): Promise<Response> {
  // A FormData body (multipart file upload) must NOT get a manual
  // Content-Type — the browser sets one itself with the correct boundary.
  const isFormData = init?.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    credentials: "include",
  });

  if (response.status === 401 && !isRetry && !AUTH_ENDPOINTS_EXCLUDED_FROM_RETRY.includes(path)) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return fetchWithAuth(path, init, true);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, init);

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  getBlob: (path: string) => fetchWithAuth(path).then((response) => response.blob()),
};
