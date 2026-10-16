import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useCallback, useEffect, useState } from "react";

import { createSessionGate } from "@/lib/session-gate";

/**
 * Returns `ensureSession`, which resolves once Convex is authenticated, signing a signed-out
 * visitor in as a guest first (see session-gate.ts). UserProvider exposes it to the app.
 */
export function useEnsureSession() {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const hasToken = useAuthToken() !== null;
  const [sessionGate] = useState(() =>
    createSessionGate({ isLoading, isAuthenticated, hasToken })
  );
  // Publish auth state to the gate: it is how ensureSession learns a new token is live
  useEffect(() => {
    sessionGate.update({ isLoading, isAuthenticated, hasToken });
  }, [sessionGate, isLoading, isAuthenticated, hasToken]);
  return useCallback(
    () => sessionGate.ensure({ signIn: () => signIn("anonymous"), signOut }),
    [sessionGate, signIn, signOut]
  );
}
