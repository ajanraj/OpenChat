"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type UserProfile = Doc<"users">;

export type ApiKey = {
  _id: Id<"user_api_keys">;
  provider: string;
  mode?: "priority" | "fallback";
  messageCount?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type Connector = Doc<"connectors">;

type UserContextType = {
  user: UserProfile | null;
  isLoading: boolean;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  // User capabilities and settings
  hasPremium: boolean;
  products: { premium?: { id: string } } | undefined;
  rateLimitStatus:
    | {
        isPremium: boolean;
        dailyCount: number;
        dailyLimit: number;
        dailyRemaining: number;
        monthlyCount: number;
        monthlyLimit: number;
        monthlyRemaining: number;
        premiumCount: number;
        premiumLimit: number;
        premiumRemaining: number;
        effectiveRemaining: number;
        dailyReset?: number;
        monthlyReset?: number;
        premiumReset?: number;
      }
    | undefined;
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
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({
  children,
}: {
  children: React.ReactNode;
  initialUser?: null;
}) {
  // isLoading will always be false here
  const { signIn, signOut } = useAuthActions();
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

  const { data: products, isLoading: isProductsLoading } = useTanStackQuery({
    ...convexQuery(api.polar.getConfiguredProducts, {}),
    enabled: Boolean(user) && !user?.isAnonymous,
    // Product configurations are very stable, cache aggressively
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  const { data: rateLimitStatus, isLoading: isRateLimitLoading } =
    useTanStackQuery({
      ...convexQuery(api.users.getRateLimitStatus, {}),
      enabled: Boolean(user),
      // Rate limits update more frequently, shorter cache
      gcTime: 5 * 60 * 1000, // 5 minutes
    });

  const { data: apiKeysQuery, isLoading: isApiKeysLoading } = useTanStackQuery({
    ...convexQuery(api.api_keys.getApiKeys, {}),
    enabled: Boolean(user) && !user?.isAnonymous,
    // API keys are relatively stable, cache reasonably
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: connectorsQuery, isLoading: isConnectorsLoading } =
    useTanStackQuery({
      ...convexQuery(
        api.connectors.listUserConnectors,
        user && !user?.isAnonymous ? {} : "skip"
      ),
      enabled: Boolean(user) && !user?.isAnonymous,
      // Connectors are relatively stable, cache reasonably
      gcTime: 10 * 60 * 1000, // 10 minutes
    });
  const updateUserProfile = useMutation(api.users.updateUserProfile);

  // Anonymous sign-in is now handled by AnonymousSignIn component in AuthGuard
  // User creation and account linking is handled by the createOrUpdateUser callback in auth.ts

  const signInGoogle = useCallback(async () => {
    await signIn("google");
  }, [signIn]);

  const updateUser = useCallback(
    async (updates: Partial<UserProfile>) => {
      // Note: Model preference updates (favoriteModels, disabledModels) should now
      // use the specialized mutations: toggleFavoriteModel, setModelEnabled, etc.
      // This function is for general profile updates only.
      await updateUserProfile({ updates });
    },
    [updateUserProfile]
  );

  // Process API keys data
  const apiKeys = useMemo(
    () => (apiKeysQuery ?? []) as ApiKey[],
    [apiKeysQuery]
  );

  // Process connectors data
  const connectors = useMemo(
    () => (connectorsQuery ?? []) as Connector[],
    [connectorsQuery]
  );

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

  // Combined loading state for user-related data (auth loading is handled by AuthLoading component)
  const combinedLoading = Boolean(
    isUserLoading ||
      (user &&
        !user.isAnonymous &&
        (isPremiumLoading ||
          isProductsLoading ||
          isRateLimitLoading ||
          isApiKeysLoading ||
          isConnectorsLoading))
  );

  const contextValue = useMemo(
    () => ({
      user,
      isLoading: combinedLoading,
      signInGoogle,
      signOut,
      updateUser,
      // User capabilities and settings
      hasPremium: (hasPremium ?? false) as boolean,
      products: products as { premium?: { id: string } } | undefined,
      rateLimitStatus: rateLimitStatus as
        | {
            isPremium: boolean;
            dailyCount: number;
            dailyLimit: number;
            dailyRemaining: number;
            monthlyCount: number;
            monthlyLimit: number;
            monthlyRemaining: number;
            premiumCount: number;
            premiumLimit: number;
            premiumRemaining: number;
            effectiveRemaining: number;
            dailyReset?: number;
            monthlyReset?: number;
            premiumReset?: number;
          }
        | undefined,
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
      signInGoogle,
      signOut,
      updateUser,
      hasPremium,
      products,
      rateLimitStatus,
      apiKeys,
      hasApiKey,
      hasOpenAI,
      hasAnthropic,
      hasGemini,
      isApiKeysLoading,
      connectors,
      isConnectorsLoading,
    ]
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
