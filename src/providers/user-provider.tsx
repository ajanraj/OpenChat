import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getNextRateLimitReset,
  measureServerClockOffset,
  type RateLimitStatus,
  resolveRateLimitStatus,
} from "@/lib/rate-limit-status";
import { createSessionGate } from "@/lib/session-gate";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type UserProfile = Doc<"users">;

export interface ApiKey {
  _id: Id<"user_api_keys">;
  provider: string;
  mode?: "priority" | "fallback";
  messageCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export type Connector = Doc<"connectors">;

interface UserContextType {
  /** Null while loading (see isLoading) or for a signed-out visitor, who has no account yet. */
  user: UserProfile | null;
  /** True while the session or the user's data is still loading. */
  isLoading: boolean;
  /**
   * Resolves once Convex is authenticated, signing a visitor in as a guest first. Call it before
   * the first write a signed-out visitor makes (sending a message); rejects if no session starts.
   */
  ensureSession: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  // User capabilities and settings
  hasPremium: boolean;
  rateLimitStatus: RateLimitStatus | undefined;
  // API Keys
  apiKeys: ApiKey[];
  hasApiKey: Map<string, boolean>;
  hasOpenAI: boolean;
  hasAnthropic: boolean;
  hasGemini: boolean;
  isApiKeysLoading: boolean;
  // Connectors
  connectors: Connector[];
  isConnectorsLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// setTimeout fires immediately for delays above 2^31 - 1 ms (~24.8 days)
const MAX_TIMEOUT_MS = 2_147_483_647;

export function UserProvider({ children }: { children: React.ReactNode; initialUser?: null }) {
  const { signIn, signOut } = useAuthActions();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const hasToken = useAuthToken() !== null;
  const [sessionGate] = useState(() =>
    createSessionGate({ isLoading: isAuthLoading, isAuthenticated, hasToken }),
  );
  // Publish Convex's auth state to the gate: it is how ensureSession learns a new token is live
  useEffect(() => {
    sessionGate.update({ isLoading: isAuthLoading, isAuthenticated, hasToken });
  }, [sessionGate, isAuthLoading, isAuthenticated, hasToken]);
  const ensureSession = useCallback(
    () => sessionGate.ensure(() => signIn("anonymous")),
    [sessionGate, signIn],
  );

  const { data: user = null, isLoading: isUserLoading } = useTanStackQuery({
    ...convexQuery(api.users.getCurrentUser, {}),
    // Extended cache for user data to prevent auth flickering
    gcTime: 30 * 60 * 1000, // 30 minutes - user data persists longer
  });

  // User capabilities and settings - only fetch when authenticated
  // NOTE: The `enabled` flag prevents TanStack Query execution but does NOT prevent
  // Convex subscription establishment. The convexQuery() call creates a WebSocket
  // subscription immediately, regardless of the enabled state. This is a known
  // limitation of the current @convex-dev/react-query integration.
  //
  // For now, we rely on server-side safety (queries return [] or null for unauthenticated users)
  // and proper error handling rather than preventing the subscription entirely.

  const { data: hasPremium, isLoading: isPremiumLoading } = useTanStackQuery({
    ...convexQuery(api.users.userHasPremium, {}),
    enabled: Boolean(user) && !user?.isAnonymous,
    // Premium status changes infrequently, cache longer
    gcTime: 15 * 60 * 1000, // 15 minutes
  });

  const { data: rateLimitState, isLoading: isRateLimitLoading } = useTanStackQuery({
    ...convexQuery(api.users.getRateLimitStatus, {}),
    enabled: Boolean(user),
    // Rate limits update more frequently, shorter cache
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Credit windows run on the server's clock; a device clock running behind would keep an
  // exhausted window that has already reset. Measured once per session (TanStack retries a
  // round trip too slow to trust).
  const getServerTime = useMutation(api.users.getServerTime);
  const { data: serverClockOffset = 0 } = useTanStackQuery({
    queryKey: ["serverClockOffset"],
    queryFn: () => measureServerClockOffset(() => getServerTime({})),
    enabled: Boolean(user),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  // The query returns raw credit buckets; remaining credits depend on the current time,
  // so resolve them here and again whenever the next window resets.
  const [now, setNow] = useState(() => Date.now());
  const rateLimitStatus = useMemo(
    () =>
      rateLimitState ? resolveRateLimitStatus(rateLimitState, now + serverClockOffset) : undefined,
    [rateLimitState, now, serverClockOffset],
  );
  const nextRateLimitReset = rateLimitStatus ? getNextRateLimitReset(rateLimitStatus) : undefined;

  useEffect(() => {
    if (nextRateLimitReset === undefined) {
      return;
    }
    // Re-arms after every tick (`now` dependency), which also covers clamped delays
    const delay = Math.min(
      Math.max(nextRateLimitReset - (Date.now() + serverClockOffset), 0),
      MAX_TIMEOUT_MS,
    );
    const timeout = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timeout);
  }, [nextRateLimitReset, now, serverClockOffset]);

  const { data: apiKeysQuery, isLoading: isApiKeysLoading } = useTanStackQuery({
    ...convexQuery(api.api_keys.getApiKeys, {}),
    enabled: Boolean(user) && !user?.isAnonymous,
    // API keys are relatively stable, cache reasonably
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: connectorsQuery, isLoading: isConnectorsLoading } = useTanStackQuery({
    ...convexQuery(api.connectors.listUserConnectors, user && !user?.isAnonymous ? {} : "skip"),
    enabled: Boolean(user) && !user?.isAnonymous,
    // Connectors are relatively stable, cache reasonably
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
  const updateUserProfile = useMutation(api.users.updateUserProfile);

  // Users (guest or Google) are created by the createOrUpdateUser callback in convex/auth.ts

  const signInGoogle = useCallback(async () => {
    await signIn("google");
  }, [signIn]);

  const updateUser = useCallback(
    async (updates: Partial<UserProfile>) => {
      // Note: Model preference updates (favoriteModels, disabledModels) should use
      // the profile mutations in convex/profiles.ts (via useModelPreferences/useModelSettings).
      // This function is for general profile updates only.
      await updateUserProfile({ updates });
    },
    [updateUserProfile],
  );

  // Process API keys data
  const apiKeys = useMemo(() => (apiKeysQuery ?? []) as ApiKey[], [apiKeysQuery]);

  // Process connectors data
  const connectors = useMemo(() => connectorsQuery ?? [], [connectorsQuery]);

  const hasApiKey = useMemo(() => {
    const keyMap = new Map<string, boolean>();
    for (const key of apiKeys) {
      keyMap.set(key.provider, true);
    }
    return keyMap;
  }, [apiKeys]);

  const hasOpenAI = hasApiKey.get("openai") ?? false;
  const hasAnthropic = hasApiKey.get("anthropic") ?? false;
  const hasGemini = hasApiKey.get("gemini") ?? false;

  // Until auth settles, getCurrentUser answers unauthenticated (null), so a null user is not yet
  // a signed-out visitor
  const combinedLoading = Boolean(
    isAuthLoading ||
    isUserLoading ||
    (user &&
      !user.isAnonymous &&
      (isPremiumLoading || isRateLimitLoading || isApiKeysLoading || isConnectorsLoading)),
  );

  const contextValue = useMemo(
    () => ({
      user,
      isLoading: combinedLoading,
      ensureSession,
      signInGoogle,
      signOut,
      updateUser,
      // User capabilities and settings
      hasPremium: hasPremium ?? false,
      rateLimitStatus: rateLimitStatus,
      // API Keys
      apiKeys,
      hasApiKey,
      hasOpenAI,
      hasAnthropic,
      hasGemini,
      isApiKeysLoading,
      // Connectors
      connectors,
      isConnectorsLoading,
    }),
    [
      user,
      combinedLoading,
      ensureSession,
      signInGoogle,
      signOut,
      updateUser,
      hasPremium,
      rateLimitStatus,
      apiKeys,
      hasApiKey,
      hasOpenAI,
      hasAnthropic,
      hasGemini,
      isApiKeysLoading,
      connectors,
      isConnectorsLoading,
    ],
  );

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
