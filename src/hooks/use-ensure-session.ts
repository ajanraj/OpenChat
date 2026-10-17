import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

import { createSessionGate } from "@/lib/session-gate";
import type { SessionGate } from "@/lib/session-gate";

/**
 * Returns `ensureSession`, which resolves once Convex is authenticated, signing a signed-out
 * visitor in as a guest first (see session-gate.ts). UserProvider exposes it to the app.
 */
export const useEnsureSession = () => {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const hasToken = useAuthToken() !== null;
  // One gate for the hook's lifetime, created on the first render
  const sessionGate = useRef<SessionGate | null>(null);
  if (sessionGate.current === null) {
    sessionGate.current = createSessionGate({
      isLoading,
      isAuthenticated,
      hasToken,
    });
  }
  // Publish auth state to the gate: it is how ensureSession learns a new token is live
  useEffect(() => {
    sessionGate.current?.update({ isLoading, isAuthenticated, hasToken });
  }, [isLoading, isAuthenticated, hasToken]);
  return useCallback(async () => {
    await sessionGate.current?.ensure({
      signIn: async () => await signIn("anonymous"),
      signOut,
    });
  }, [signIn, signOut]);
};
