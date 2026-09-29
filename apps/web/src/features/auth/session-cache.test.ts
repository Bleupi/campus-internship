import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { MeResponse } from "shared";
import { describe, expect, it } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "./query-keys";
import { resetCacheForSessionEnd, resetCacheForSessionStart } from "./session-cache";

const PROFILE_KEY = ["students", "me", "profile"] as const;

const currentUser = { user: { id: "u1" } } as unknown as MeResponse;

// A fetch started under the old session, still in flight at the boundary,
// that only fails (401) once the reset has run.
function observeInFlightFetch(queryClient: QueryClient) {
  let failWith401!: () => void;
  const observer = new QueryObserver(queryClient, {
    queryKey: PROFILE_KEY,
    queryFn: () =>
      new Promise((_, reject) => {
        failWith401 = () => reject(new Error("401"));
      }),
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe, failWith401: () => failWith401() };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// removeQueries destroys each query, which silently cancels its fetch: this
// pins that TanStack guarantee, which both resets rely on.
describe.each([
  [
    "resetCacheForSessionStart",
    (queryClient: QueryClient) => resetCacheForSessionStart(queryClient, currentUser),
  ],
  ["resetCacheForSessionEnd", (queryClient: QueryClient) => resetCacheForSessionEnd(queryClient)],
])("%s", (_, reset) => {
  it("cancels a removed query's fetch still in flight, so its late 401 surfaces nowhere", async () => {
    const queryClient = new QueryClient();
    const { observer, unsubscribe, failWith401 } = observeInFlightFetch(queryClient);
    await flush();

    await reset(queryClient);
    failWith401();
    await flush();

    expect(observer.getCurrentResult().isError).toBe(false);
    expect(queryClient.getQueryState(PROFILE_KEY)).toBeUndefined();
    unsubscribe();
  });
});

describe("resetCacheForSessionStart", () => {
  it("drops every query of the previous session and seeds the new current user", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PROFILE_KEY, { profileStatus: "PENDING" });

    await resetCacheForSessionStart(queryClient, currentUser);

    expect(queryClient.getQueryData(PROFILE_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBe(currentUser);
  });
});

describe("resetCacheForSessionEnd", () => {
  it("cancels an in-flight /auth/me, so its late answer can't sign the ended session's user back in", async () => {
    const queryClient = new QueryClient();
    let answer!: (me: MeResponse) => void;
    const observer = new QueryObserver(queryClient, {
      queryKey: CURRENT_USER_QUERY_KEY,
      queryFn: () =>
        new Promise<MeResponse>((resolve) => {
          answer = resolve;
        }),
    });
    const unsubscribe = observer.subscribe(() => {});
    await flush();

    await resetCacheForSessionEnd(queryClient);
    answer(currentUser);
    await flush();

    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull();
    unsubscribe();
  });

  it("drops every query of the ended session but keeps the current user, as null", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, currentUser);
    queryClient.setQueryData(PROFILE_KEY, { profileStatus: "VALID" });

    await resetCacheForSessionEnd(queryClient);

    expect(queryClient.getQueryData(PROFILE_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull();
  });
});
