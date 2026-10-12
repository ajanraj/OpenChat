import { getAuthUserId } from "@convex-dev/auth/server";
import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { MODEL_DEFAULT } from "../src/lib/config";
import { ERROR_CODES } from "../src/lib/error-codes";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { deleteAuthData, purgeUserDataBatch } from "./lib/cleanup_helper";
import { RATE_LIMITS } from "./lib/rateLimitConstants";
import { cancelBillableSubscriptions, hasActivePremium } from "./stripe";
import { rateLimiter } from "./rateLimiter";
import { User } from "./schema/user";

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      ...User.fields,
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const userHasPremium = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }

    try {
      return await hasActivePremium(ctx, userId);
    } catch {
      return false;
    }
  },
});

// Note: User initialization logic has been moved to convex/auth.ts
// in the createOrUpdateUser callback for better security and simplicity

// Note: storeCurrentUser mutation has been removed.
// User creation and initialization is now handled by the createOrUpdateUser
// callback in convex/auth.ts for better security and simplicity.

export const updateUserProfile = mutation({
  args: {
    updates: v.object({
      preferredModel: v.optional(v.string()),
      preferredName: v.optional(v.string()),
      occupation: v.optional(v.string()),
      traits: v.optional(v.string()),
      about: v.optional(v.string()),
      disabledModels: v.optional(v.array(v.string())),
      favoriteModels: v.optional(v.array(v.string())),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    // Apply the updates
    await ctx.db.patch(userId, { ...updates });

    return null;
  },
});

export const toggleFavoriteModel = mutation({
  args: { modelId: v.string() },
  returns: v.null(),
  handler: async (ctx, { modelId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const currentFavorites = user.favoriteModels ?? [];
    const currentDisabled = user.disabledModels ?? [];
    const isFavorite = currentFavorites.includes(modelId);

    let newFavorites: string[];
    let newDisabled: string[];

    if (isFavorite) {
      // Removing from favorites - ensure at least one remains
      if (currentFavorites.length <= 1) {
        return null; // Cannot remove last favorite
      }
      newFavorites = currentFavorites.filter((id) => id !== modelId);
      newDisabled = currentDisabled; // Don't auto-disable when unfavoriting
    } else {
      // Adding to favorites - remove from disabled if present (auto-enable)
      newFavorites = [...new Set([...currentFavorites, modelId])];
      newDisabled = currentDisabled.filter((id) => id !== modelId);
    }

    await ctx.db.patch(userId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const setModelEnabled = mutation({
  args: { modelId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { modelId, enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    // Cannot disable MODEL_DEFAULT
    if (!enabled && modelId === MODEL_DEFAULT) {
      return null;
    }

    const currentFavorites = user.favoriteModels ?? [];
    const currentDisabled = user.disabledModels ?? [];
    const isCurrentlyDisabled = currentDisabled.includes(modelId);

    let newFavorites = currentFavorites;
    let newDisabled: string[];

    if (enabled) {
      // Enabling model - remove from disabled list
      newDisabled = currentDisabled.filter((id) => id !== modelId);
    } else {
      // Disabling model - add to disabled list and remove from favorites
      newDisabled = isCurrentlyDisabled
        ? currentDisabled
        : [...new Set([...currentDisabled, modelId])];
      newFavorites = currentFavorites.filter((id) => id !== modelId);

      // Ensure at least one favorite remains
      if (newFavorites.length === 0 && currentFavorites.length > 0) {
        // Keep the first favorite and remove it from disabled list
        const firstFavorite = currentFavorites[0];
        newFavorites = [firstFavorite];
        newDisabled = newDisabled.filter((id) => id !== firstFavorite);
      }
    }

    await ctx.db.patch(userId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const bulkSetModelsDisabled = mutation({
  args: { modelIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { modelIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const currentFavorites = user.favoriteModels ?? [];
    const currentDisabled = user.disabledModels ?? [];

    // Filter out MODEL_DEFAULT from the models to disable
    const modelsToDisable = modelIds.filter((id) => id !== MODEL_DEFAULT);

    let newFavorites: string[];
    let newDisabled: string[];

    if (modelsToDisable.length === 0) {
      // Unselect all: enable all models
      newDisabled = [];
      newFavorites = currentFavorites;
    } else {
      // Remove disabled models from favorites
      newFavorites = currentFavorites.filter((id) => !modelsToDisable.includes(id));
      // Merge with existing disabled models (fix critical bug)
      newDisabled = [...new Set([...currentDisabled, ...modelsToDisable])];

      // Ensure at least one favorite remains
      if (newFavorites.length === 0 && currentFavorites.length > 0) {
        // Keep the first favorite and remove it from disabled list
        const firstFavorite = currentFavorites[0];
        newFavorites = [firstFavorite];
        newDisabled = newDisabled.filter((id) => id !== firstFavorite);
      }
    }

    await ctx.db.patch(userId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const bulkSetFavoriteModels = mutation({
  args: { modelIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { modelIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    // Ensure at least one favorite model is provided
    if (modelIds.length === 0) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }

    const currentDisabled = user.disabledModels ?? [];

    // Set new favorites to the provided model IDs
    const newFavorites = [...new Set(modelIds)]; // Remove duplicates

    // Remove favorite models from disabled list (auto-enable favorites)
    const newDisabled = currentDisabled.filter((id) => !newFavorites.includes(id));

    await ctx.db.patch(userId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const incrementMessageCount = mutation({
  args: {
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { usesPremiumCredits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    // For premium users using premium models, deduct from premium credits
    if (isPremium && usesPremiumCredits) {
      await rateLimiter.limit(ctx, "premiumMonthly", {
        key: userId,
        throws: true,
      });
    } else {
      // For non-premium models or non-premium users, use standard credits

      // CONSUME daily limits for non-premium users
      if (!isPremium) {
        const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
        await rateLimiter.limit(ctx, dailyLimitName, {
          key: userId,
          throws: true,
        });
      }

      // CONSUME monthly limits for all users
      await rateLimiter.limit(ctx, "standardMonthly", {
        key: userId,
        throws: true,
      });
    }

    return null;
  },
});

export const incrementStandardCredits = mutation({
  args: {
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { count }) => {
    const creditsToConsume = count ?? 1;

    if (!Number.isInteger(creditsToConsume) || creditsToConsume <= 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    if (!isPremium) {
      const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
      await rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: creditsToConsume,
        throws: true,
      });
    }

    await rateLimiter.limit(ctx, "standardMonthly", {
      key: userId,
      count: creditsToConsume,
      throws: true,
    });

    return null;
  },
});

export const assertNotOverLimit = mutation({
  args: {
    usesPremiumCredits: v.optional(v.boolean()),
  },
  handler: async (ctx, { usesPremiumCredits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    // For premium users using premium models, check premium credits
    if (isPremium && usesPremiumCredits) {
      const premiumStatus = await rateLimiter.check(ctx, "premiumMonthly", {
        key: userId,
      });
      if (!premiumStatus.ok) {
        throw new ConvexError(ERROR_CODES.PREMIUM_LIMIT_REACHED);
      }
    } else {
      // For non-premium models or non-premium users, check standard credits

      const checkPromises: Promise<unknown>[] = [];

      // CHECK daily limits for non-premium users (don't consume yet)
      if (!isPremium) {
        const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
        checkPromises.push(
          rateLimiter.check(ctx, dailyLimitName, {
            key: userId,
          }),
        );
      }

      // CHECK monthly limits for all users (don't consume yet)
      checkPromises.push(
        rateLimiter.check(ctx, "standardMonthly", {
          key: userId,
        }),
      );

      const results = await Promise.all(checkPromises);

      // Check daily limit result (if applicable)
      if (!isPremium && results.length > 1) {
        const dailyStatus = results[0] as { ok: boolean };
        if (!dailyStatus.ok) {
          throw new ConvexError(ERROR_CODES.DAILY_LIMIT_REACHED);
        }
      }

      // Check monthly limit result (always the last promise)
      const monthlyStatus = results[results.length - 1] as { ok: boolean };
      if (!monthlyStatus.ok) {
        throw new ConvexError(ERROR_CODES.MONTHLY_LIMIT_REACHED);
      }
    }
  },
});

export const getRateLimitStatus = query({
  args: {},
  returns: v.object({
    isPremium: v.boolean(),
    dailyCount: v.number(),
    dailyLimit: v.number(),
    dailyRemaining: v.number(),
    monthlyCount: v.number(),
    monthlyLimit: v.number(),
    monthlyRemaining: v.number(),
    premiumCount: v.number(),
    premiumLimit: v.number(),
    premiumRemaining: v.number(),
    effectiveRemaining: v.number(),
    dailyReset: v.optional(v.number()),
    monthlyReset: v.optional(v.number()),
    premiumReset: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    // console.log('getRateLimitStatus called for userId:', userId);
    if (!userId) {
      // Return safe defaults for unauthenticated users
      return {
        isPremium: false,
        dailyCount: 0,
        dailyLimit: 0,
        dailyRemaining: 0,
        monthlyCount: 0,
        monthlyLimit: 0,
        monthlyRemaining: 0,
        premiumCount: 0,
        premiumLimit: 0,
        premiumRemaining: 0,
        effectiveRemaining: 0,
      };
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;
    const now = Date.now();

    // Determine daily limit name for non-premium users
    const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";

    // Parallel fetching of all rate limit data
    const [dailyStatus, dailyConfig, monthlyStatus, monthlyConfig, premiumStatus, premiumConfig] =
      await Promise.all([
        isPremium ? Promise.resolve(null) : rateLimiter.check(ctx, dailyLimitName, { key: userId }),
        isPremium
          ? Promise.resolve(null)
          : rateLimiter.getValue(ctx, dailyLimitName, { key: userId }),
        rateLimiter.check(ctx, "standardMonthly", { key: userId }),
        rateLimiter.getValue(ctx, "standardMonthly", { key: userId }),
        isPremium
          ? rateLimiter.check(ctx, "premiumMonthly", { key: userId })
          : Promise.resolve(null),
        isPremium
          ? rateLimiter.getValue(ctx, "premiumMonthly", { key: userId })
          : Promise.resolve(null),
      ]);

    // Process daily limits
    let dailyLimit = 0;
    let dailyCount = 0;
    let dailyRemaining = 0;
    let dailyReset: number | undefined;

    if (!isPremium && dailyStatus && dailyConfig) {
      dailyLimit = isAnonymous ? RATE_LIMITS.ANONYMOUS_DAILY : RATE_LIMITS.AUTHENTICATED_DAILY;
      dailyCount = dailyLimit - (dailyStatus.ok ? dailyConfig.value : 0);
      dailyRemaining = dailyStatus.ok ? dailyConfig.value : 0;

      // Use the rate limiter component's own logic for accurate reset time
      const dailyRateLimit = calculateRateLimit(
        { value: dailyConfig.value, ts: dailyConfig.ts },
        dailyConfig.config,
        now,
        0, // Don't consume tokens, just calculate
      );

      // For fixed windows, the next reset is the end of the current window
      if (dailyRateLimit.windowStart !== undefined) {
        const config = dailyConfig.config;
        dailyReset = dailyRateLimit.windowStart + config.period;
      }
    }

    // Process monthly limits (standard for all users)
    const monthlyLimit = RATE_LIMITS.STANDARD_MONTHLY;
    const monthlyCount = monthlyLimit - (monthlyStatus.ok ? monthlyConfig.value : 0);
    const monthlyRemaining = monthlyStatus.ok ? monthlyConfig.value : 0;

    // Use the rate limiter component's own logic for accurate reset time
    const monthlyRateLimit = calculateRateLimit(
      { value: monthlyConfig.value, ts: monthlyConfig.ts },
      monthlyConfig.config,
      now,
      0, // Don't consume tokens, just calculate
    );

    // For fixed windows, the next reset is the end of the current window
    let monthlyReset: number | undefined;
    if (monthlyRateLimit.windowStart !== undefined) {
      const config = monthlyConfig.config;
      monthlyReset = monthlyRateLimit.windowStart + config.period;
    }

    // Process premium credits (for premium users)
    let premiumLimit = 0;
    let premiumCount = 0;
    let premiumRemaining = 0;
    let premiumReset: number | undefined;

    if (isPremium && premiumStatus && premiumConfig) {
      premiumLimit = RATE_LIMITS.PREMIUM_MONTHLY;
      premiumCount = premiumLimit - (premiumStatus.ok ? premiumConfig.value : 0);
      premiumRemaining = premiumStatus.ok ? premiumConfig.value : 0;

      // Use the rate limiter component's own logic for accurate reset time
      const premiumRateLimit = calculateRateLimit(
        { value: premiumConfig.value, ts: premiumConfig.ts },
        premiumConfig.config,
        now,
        0, // Don't consume tokens, just calculate
      );

      // For fixed windows, the next reset is the end of the current window
      if (premiumRateLimit.windowStart !== undefined) {
        const config = premiumConfig.config;
        premiumReset = premiumRateLimit.windowStart + config.period;
      }
    }

    const effectiveRemaining = isPremium
      ? monthlyRemaining
      : Math.min(dailyRemaining, monthlyRemaining);

    return {
      isPremium,
      dailyCount,
      dailyLimit,
      dailyRemaining,
      monthlyCount,
      monthlyLimit,
      monthlyRemaining,
      premiumCount,
      premiumLimit,
      premiumRemaining,
      effectiveRemaining,
      dailyReset,
      monthlyReset,
      premiumReset,
    };
  },
});

// Note: mergeAnonymousToGoogleAccount mutation has been removed.
// The application no longer automatically merges anonymous accounts with Google accounts
// for security and simplicity. Users who sign in with Google will start with fresh accounts.

/**
 * Deletes the signed-in account. Sign-in data and the user record go right away; everything
 * else is purged in the background (purgeDeletedUserData) and any subscription that can still
 * bill is canceled immediately (cancelDeletedUserSubscriptions). Stripe billing records are
 * kept. Calling it again after the user is gone is a no-op.
 */
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    if (!(await ctx.db.get(userId))) {
      return null;
    }

    await deleteAuthData(ctx, userId);
    await ctx.db.delete(userId);
    await ctx.scheduler.runAfter(0, internal.users.purgeDeletedUserData, { userId });
    await ctx.scheduler.runAfter(0, internal.users.cancelDeletedUserSubscriptions, { userId });
    return null;
  },
});

/**
 * Purges a deleted user's data one budget-bounded batch per run, rescheduling itself until
 * nothing is left. If a run throws, re-run it with the same userId; it resumes where it stopped.
 */
export const purgeDeletedUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }): Promise<null> => {
    if (!(await purgeUserDataBatch(ctx, userId))) {
      await ctx.scheduler.runAfter(0, internal.users.purgeDeletedUserData, { userId });
    }
    return null;
  },
});

const SUBSCRIPTION_CANCEL_MAX_ATTEMPTS = 5;
const SUBSCRIPTION_CANCEL_RETRY_BASE_MS = 30_000;

/**
 * Cancels a deleted user's billable Stripe subscriptions. A failure would keep billing the
 * user, so it retries with exponential backoff before giving up with an error log.
 */
export const cancelDeletedUserSubscriptions = internalAction({
  args: { userId: v.id("users"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { userId, attempt = 1 }): Promise<null> => {
    try {
      await cancelBillableSubscriptions(ctx, userId);
    } catch (error) {
      if (attempt >= SUBSCRIPTION_CANCEL_MAX_ATTEMPTS) {
        console.error(
          `Giving up canceling Stripe subscriptions of deleted user ${userId} after ${attempt} attempts; cancel them in the Stripe dashboard:`,
          error,
        );
        throw error;
      }
      console.warn(
        `Canceling Stripe subscriptions of deleted user ${userId} failed (attempt ${attempt}); retrying:`,
        error,
      );
      await ctx.scheduler.runAfter(
        SUBSCRIPTION_CANCEL_RETRY_BASE_MS * 2 ** (attempt - 1),
        internal.users.cancelDeletedUserSubscriptions,
        { userId, attempt: attempt + 1 },
      );
    }
    return null;
  },
});

// React hook API functions for rate limiting
export const { getRateLimit: getRateLimitHook, getServerTime } = rateLimiter.hookAPI(
  "authenticatedDaily", // Default rate limit
  {
    key: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      return userId || "anonymous";
    },
  },
);

// Internal query to get user by ID
export const getUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      ...User.fields,
    }),
  ),
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

// Internal mutation to check rate limits for scheduled tasks
export const assertNotOverLimitInternal = internalMutation({
  args: {
    userId: v.id("users"),
    requiresPremium: v.boolean(),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, requiresPremium, usesPremiumCredits }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    if (requiresPremium && !isPremium) {
      throw new ConvexError(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED);
    }
    const isAnonymous = user.isAnonymous ?? false;

    // For premium users using premium models, check premium credits
    if (isPremium && usesPremiumCredits) {
      const premiumStatus = await rateLimiter.check(ctx, "premiumMonthly", {
        key: userId,
      });
      if (!premiumStatus.ok) {
        throw new ConvexError(ERROR_CODES.PREMIUM_LIMIT_REACHED);
      }
    } else {
      // For non-premium models or non-premium users, check standard credits
      const checkPromises: Promise<unknown>[] = [];

      // CHECK daily limits for non-premium users (don't consume yet)
      if (!isPremium) {
        const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
        checkPromises.push(
          rateLimiter.check(ctx, dailyLimitName, {
            key: userId,
          }),
        );
      }

      // CHECK monthly limits for all users (don't consume yet)
      checkPromises.push(
        rateLimiter.check(ctx, "standardMonthly", {
          key: userId,
        }),
      );

      const results = await Promise.all(checkPromises);

      // Check results and throw appropriate errors
      for (const [index, result] of results.entries()) {
        const limitResult = result as { ok: boolean };
        if (!limitResult.ok) {
          if (index === 0 && !isPremium) {
            // Daily limit exceeded
            throw new ConvexError(ERROR_CODES.DAILY_LIMIT_REACHED);
          }
          // Monthly limit exceeded (or only monthly was checked)
          throw new ConvexError(ERROR_CODES.MONTHLY_LIMIT_REACHED);
        }
      }
    }
  },
});

// Internal mutation to increment message count for scheduled tasks
export const incrementMessageCountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, usesPremiumCredits }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    // For premium users using premium models, deduct from premium credits
    if (isPremium && usesPremiumCredits) {
      await rateLimiter.limit(ctx, "premiumMonthly", {
        key: userId,
        throws: true,
      });
    } else {
      // For non-premium models or non-premium users, use standard credits

      // CONSUME daily limits for non-premium users
      if (!isPremium) {
        const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
        await rateLimiter.limit(ctx, dailyLimitName, {
          key: userId,
          throws: true,
        });
      }

      // CONSUME monthly limits for all users
      await rateLimiter.limit(ctx, "standardMonthly", {
        key: userId,
        throws: true,
      });
    }

    return null;
  },
});

export const incrementStandardCreditsInternal = internalMutation({
  args: {
    userId: v.id("users"),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, count }) => {
    const creditsToConsume = count ?? 1;

    if (!Number.isInteger(creditsToConsume) || creditsToConsume <= 0) {
      throw new ConvexError(ERROR_CODES.INVALID_INPUT);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const isPremium = await hasActivePremium(ctx, user._id);
    const isAnonymous = user.isAnonymous ?? false;

    if (!isPremium) {
      const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
      await rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: creditsToConsume,
        throws: true,
      });
    }

    await rateLimiter.limit(ctx, "standardMonthly", {
      key: userId,
      count: creditsToConsume,
      throws: true,
    });

    return null;
  },
});

// Update all users' preferred model to a new value
export const updateAllUsersPreferredModel = internalMutation({
  args: {
    newPreferredModel: v.string(),
  },
  returns: v.object({
    updatedCount: v.number(),
    totalCount: v.number(),
  }),
  handler: async (ctx, { newPreferredModel }) => {
    // Get all users from the database
    const allUsers = await ctx.db.query("users").collect();
    const totalCount = allUsers.length;

    // Update each user's preferredModel in parallel
    const updatePromises = allUsers.map(async (user) => {
      await ctx.db.patch(user._id, {
        preferredModel: newPreferredModel,
      });
    });

    // Wait for all updates to complete and count successes
    const results = await Promise.allSettled(updatePromises);
    const updatedCount = results.filter((result) => result.status === "fulfilled").length;

    return {
      updatedCount,
      totalCount,
    };
  },
});
