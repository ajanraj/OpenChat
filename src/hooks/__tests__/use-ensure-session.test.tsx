import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { renderHook } from "@testing-library/react";
import { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useEnsureSession } from "../use-ensure-session";

const ADDRESS = "https://test.convex.cloud";
// Convex Auth namespaces its storage keys by deployment address
const STORED_JWT_KEY = "__convexAuthJWT_httpstestconvexcloud";

/** In-memory token storage for ConvexAuthProvider (the test setup stubs out localStorage). */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

/**
 * A real ConvexReactClient (it connects lazily, so no websocket opens) with its backend stubbed:
 * every token is accepted except `rejectedToken`, and Convex Auth's actions return a new guest.
 */
function stubbedClient(rejectedToken?: string) {
  const client = new ConvexReactClient(ADDRESS);
  const setAuth = vi.spyOn(client, "setAuth").mockImplementation((fetchToken, onChange) => {
    void (async () => {
      const token = await fetchToken({ forceRefreshToken: false });
      if (token && token !== rejectedToken) {
        onChange?.(true);
        return;
      }
      // Like Convex: after a rejection it asks for a refreshed token before giving up
      const refreshed = await fetchToken({ forceRefreshToken: true });
      onChange?.(Boolean(refreshed) && refreshed !== rejectedToken);
    })();
  });
  vi.spyOn(client, "clearAuth").mockImplementation(() => undefined);
  // auth:signIn reads the tokens; auth:signOut ignores its result
  const action = vi
    .spyOn(client, "action")
    .mockResolvedValue({ tokens: { token: "guest-jwt", refreshToken: "guest-refresh" } });
  const callsTo = (name: string) =>
    action.mock.calls.filter(([called]) => getFunctionName(called) === name).length;
  return { client, setAuth, callsTo };
}

function renderEnsureSession(client: ConvexReactClient, storedTokens: Record<string, string> = {}) {
  const storage = memoryStorage(storedTokens);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConvexAuthProvider client={client} storage={storage}>
      {children}
    </ConvexAuthProvider>
  );
  return renderHook(() => useEnsureSession(), { wrapper }).result;
}

describe("useEnsureSession with Convex Auth", () => {
  it("signs a signed-out visitor in as a guest and resolves once Convex accepts the token", async () => {
    const { client, setAuth, callsTo } = stubbedClient();
    const ensureSession = renderEnsureSession(client);

    await ensureSession.current();

    expect(callsTo("auth:signIn")).toBe(1);
    expect(callsTo("auth:signOut")).toBe(0);
    expect(setAuth).toHaveBeenCalledOnce();
  });

  it("replaces a stored token the backend rejected, and Convex picks up the new one", async () => {
    const { client, setAuth, callsTo } = stubbedClient("stale-jwt");
    // A stored token with no refresh token: Convex Auth keeps it after the rejection
    const ensureSession = renderEnsureSession(client, { [STORED_JWT_KEY]: "stale-jwt" });
    await vi.waitFor(() =>{  expect(setAuth).toHaveBeenCalledOnce(); });

    const outcome = ensureSession.current().then(
      () => "authenticated",
      (error: Error) => error.message,
    );

    // A token swapped in place never reaches Convex; signing out first makes it set auth again
    await vi.waitFor(() =>{  expect(setAuth).toHaveBeenCalledTimes(2); });
    await expect(outcome).resolves.toBe("authenticated");
    expect(callsTo("auth:signOut")).toBe(1);
    expect(callsTo("auth:signIn")).toBe(1);
  });
});
