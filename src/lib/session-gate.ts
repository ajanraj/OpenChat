/**
 * Guest sessions start lazily: visitors browse signed out, and the first message they send signs
 * them in anonymously. `signIn` resolves before Convex has confirmed the new token on its websocket
 * (ConvexProviderWithAuth applies it in an effect after the next render), so a mutation sent right
 * after it would run unauthenticated. The gate instead waits for the auth state React observes.
 */

/** Convex auth state: `useConvexAuth()`, plus whether Convex Auth holds a token (`useAuthToken()`). */
export interface AuthState {
  isLoading: boolean;
  /** The backend has confirmed the token. */
  isAuthenticated: boolean;
  /** Convex Auth holds a token, confirmed or not. */
  hasToken: boolean;
}

/** How long one attempt may take to settle, sign in and get the token confirmed. */
export const SESSION_TIMEOUT_MS = 15_000;

interface SignInResult {
  signingIn: boolean;
}

const timeoutError = () => new Error("Timed out waiting for the session to start");

/** Settles like `promise`, or rejects once `deadline` (epoch ms) passes. */
function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), deadline - Date.now());
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Create one per app (UserProvider). Feed it every auth state change with `update`; `ensure`
 * resolves once Convex is authenticated, signing in anonymously when there is no session yet.
 */
export function createSessionGate(initial: AuthState) {
  let current = initial;
  let pending: Promise<void> | null = null;
  // Outlives a timed-out attempt: the retry waits on the same sign-in instead of starting a second
  // one, which would create a second guest account
  let signInInFlight: Promise<SignInResult> | null = null;
  // The gate's sign-in succeeded and Convex hasn't confirmed it. Until it does, useConvexAuth()
  // reads the new token as signed out, the same as a stored token the backend rejected, so this
  // is what lets the next attempt wait on the guest it created instead of creating another. That
  // attempt uses it up: if it times out too, the one after signs in afresh rather than wait forever.
  let unconfirmedSignIn = false;
  const listeners = new Set<() => void>();

  function waitFor(predicate: (state: AuthState) => boolean, deadline: number) {
    return new Promise<AuthState>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check);
        reject(timeoutError());
      }, deadline - Date.now());
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
      if (next.isAuthenticated) {
        unconfirmedSignIn = false;
      }
      // A listener that resolves removes itself; deleting the current entry is safe mid-iteration
      for (const listener of listeners) {
        listener();
      }
    },

    /** Concurrent calls share one attempt; a failed attempt is retried by the next call. */
    ensure(signInAnonymously: () => Promise<SignInResult>): Promise<void> {
      pending ??= (async () => {
        const deadline = Date.now() + SESSION_TIMEOUT_MS;
        const settled = await waitFor((state) => !state.isLoading, deadline);
        if (settled.isAuthenticated) {
          return;
        }
        // Wait on the guest this gate created, once; otherwise sign in, which also replaces a stored
        // token the backend rejected
        const awaitsOwnToken = unconfirmedSignIn && settled.hasToken;
        unconfirmedSignIn = false;
        if (!awaitsOwnToken) {
          signInInFlight ??= signInAnonymously()
            .then((result) => {
              unconfirmedSignIn = result.signingIn;
              return result;
            })
            .finally(() => {
              signInInFlight = null;
            });
          const { signingIn } = await beforeDeadline(signInInFlight, deadline);
          if (!signingIn) {
            throw new Error("Anonymous sign-in did not start a session");
          }
        }
        await waitFor((state) => state.isAuthenticated, deadline);
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

export type SessionGate = ReturnType<typeof createSessionGate>;
