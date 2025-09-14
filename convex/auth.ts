import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { MODEL_DEFAULT, RECOMMENDED_MODELS } from "../lib/config";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

// Helper function to initialize user fields
const initializeUserFields = () => ({
  preferredModel: MODEL_DEFAULT,
  // By default no models are disabled – an empty array means all are enabled
  disabledModels: [],
  // Initialize with recommended models as favorites
  favoriteModels: [...RECOMMENDED_MODELS],
});

// Helper function to initialize rate limits for new user
const initializeRateLimits = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  isAnonymous: boolean
): Promise<void> => {
  try {
    const rateLimitPromises: Promise<unknown>[] = [];

    // Daily limits based on user type
    const dailyLimitName = isAnonymous
      ? "anonymousDaily"
      : "authenticatedDaily";
    rateLimitPromises.push(
      rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: 0,
      })
    );

    // Monthly limits for all users
    rateLimitPromises.push(
      rateLimiter.limit(ctx, "standardMonthly", {
        key: userId,
        count: 0,
      })
    );

    // Initialize premium credits counter for all users (will only be used by premium users)
    rateLimitPromises.push(
      rateLimiter.limit(ctx, "premiumMonthly", {
        key: userId,
        count: 0,
      })
    );

    await Promise.all(rateLimitPromises);
  } catch (_error) {
    // Non-fatal: rate-limit initialisation failure should never block the
    // user flow. The rate-limiter will lazily create windows on first use.
  }
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    Anonymous({
      profile: () => ({ isAnonymous: true }),
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const { existingUserId, type, profile } = args;

      // If user already exists, just return their ID - no updates needed
      if (existingUserId) {
        return existingUserId;
      }

      // Create new user (either anonymous or OAuth)
      const isAnonymous = type !== "oauth";

      // Build user fields with OAuth profile information if available
      const baseFields = {
        isAnonymous,
        ...initializeUserFields(),
      };

      const userFields =
        type === "oauth" && profile
          ? {
              ...baseFields,
              name: profile.name as string | undefined,
              email: profile.email as string | undefined,
              image: (profile.picture || profile.image) as string | undefined,
              // OAuth providers have already verified the email
              emailVerificationTime: Date.now(),
            }
          : baseFields;

      const userId = await ctx.db.insert("users", userFields);

      // Initialize rate limits for new user
      await initializeRateLimits(ctx, userId, isAnonymous);

      return userId;
    },
  },
});
