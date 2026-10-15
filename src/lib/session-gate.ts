/**
 * Guest sessions start lazily: visitors browse signed out, and the first message they send signs
 * them in anonymously. `signIn` resolves before Convex has confirmed the new token on its websocket
 * (ConvexProviderWithAuth applies it in an effect after the next render), so a mutation sent right
 * after it would run unauthenticated. The gate instead waits for the auth state React observes.
 */

/** Convex auth state as reported by `useConvexAuth()`. */
export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
}

/** How long to wait for Convex to settle or confirm a session before giving up. */
export const SESSION_TIMEOUT_MS = 15_000;

/**
 * Create one per app (UserProvider). Feed it every auth state change with `update`; `ensure`
 * resolves once Convex is authenticated, signing in anonymously when there is no session yet.
 */
export function createSessionGate(initial: AuthState) {
  let current = initial;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function waitFor(predicate: (state: AuthState) => boolean): Promise<AuthState> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check);
        reject(new Error("Timed out waiting for the session to start"));
      }, SESSION_TIMEOUT_MS);
      function check() {
        if (predicate(current)) {
          clearTimeout(timer);
          listeners.delete(check);
          resolve(current);
        }
      }
      listeners.add(check);
      check();
    });
  }

  return {
    update(next: AuthState) {
      current = next;
      // A listener that resolves removes itself; deleting the current entry is safe mid-iteration
      for (const listener of listeners) {
        listener();
      }
    },

    /** Concurrent calls share one sign-in; a failed attempt is retried by the next call. */
    ensure(signInAnonymously: () => Promise<{ signingIn: boolean }>): Promise<void> {
      pending ??= (async () => {
        const settled = await waitFor((state) => !state.isLoading);
        if (settled.isAuthenticated) {
          return;
        }
        const { signingIn } = await signInAnonymously();
        if (!signingIn) {
          throw new Error("Anonymous sign-in did not start a session");
        }
        await waitFor((state) => state.isAuthenticated);
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

export type SessionGate = ReturnType<typeof createSessionGate>;
