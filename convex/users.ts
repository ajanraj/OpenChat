import { getAuthUserId } from "@convex-dev/auth/server";
import {
  calculateRateLimit,
  type RateLimitConfig,
} from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { MODEL_DEFAULT } from "../lib/config";
import { ERROR_CODES } from "../lib/error-codes";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { RATE_LIMITS } from "./lib/rateLimitConstants";
import { polar } from "./polar";
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
    })
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
      const subscription = await polar.getCurrentSubscription(ctx, { userId });
      return subscription?.status === "active";
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
      newFavorites = currentFavorites.filter(
        (id) => !modelsToDisable.includes(id)
      );
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
    const newDisabled = currentDisabled.filter(
      (id) => !newFavorites.includes(id)
    );

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

    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const isPremium = subscription?.status === "active";
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
        const dailyLimitName = isAnonymous
          ? "anonymousDaily"
          : "authenticatedDaily";
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

    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const isPremium = subscription?.status === "active";
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
        const dailyLimitName = isAnonymous
          ? "anonymousDaily"
          : "authenticatedDaily";
        checkPromises.push(
          rateLimiter.check(ctx, dailyLimitName, {
            key: userId,
          })
        );
      }

      // CHECK monthly limits for all users (don't consume yet)
      checkPromises.push(
        rateLimiter.check(ctx, "standardMonthly", {
          key: userId,
        })
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
      const monthlyStatus = results.at(-1) as { ok: boolean };
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

    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const isPremium = subscription?.status === "active";
    const isAnonymous = user.isAnonymous ?? false;
    const now = Date.now();

    // Determine daily limit name for non-premium users
    const dailyLimitName = isAnonymous
      ? "anonymousDaily"
      : "authenticatedDaily";

    // Parallel fetching of all rate limit data
    const [
      dailyStatus,
      dailyConfig,
      monthlyStatus,
      monthlyConfig,
      premiumStatus,
      premiumConfig,
    ] = await Promise.all([
      isPremium
        ? Promise.resolve(null)
        : rateLimiter.check(ctx, dailyLimitName, { key: userId }),
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
      dailyLimit = isAnonymous
        ? RATE_LIMITS.ANONYMOUS_DAILY
        : RATE_LIMITS.AUTHENTICATED_DAILY;
      dailyCount = dailyLimit - (dailyStatus.ok ? dailyConfig.value : 0);
      dailyRemaining = dailyStatus.ok ? dailyConfig.value : 0;

      // Use the rate limiter component's own logic for accurate reset time
      const dailyRateLimit = calculateRateLimit(
        { value: dailyConfig.value, ts: dailyConfig.ts },
        dailyConfig.config,
        now,
        0 // Don't consume tokens, just calculate
      );

      // For fixed windows, the next reset is the end of the current window
      if (dailyRateLimit.windowStart !== undefined) {
        const config = dailyConfig.config as RateLimitConfig;
        dailyReset = dailyRateLimit.windowStart + config.period;
      }
    }

    // Process monthly limits (standard for all users)
    const monthlyLimit = RATE_LIMITS.STANDARD_MONTHLY;
    const monthlyCount =
      monthlyLimit - (monthlyStatus.ok ? monthlyConfig.value : 0);
    const monthlyRemaining = monthlyStatus.ok ? monthlyConfig.value : 0;

    // Use the rate limiter component's own logic for accurate reset time
    const monthlyRateLimit = calculateRateLimit(
      { value: monthlyConfig.value, ts: monthlyConfig.ts },
      monthlyConfig.config,
      now,
      0 // Don't consume tokens, just calculate
    );

    // For fixed windows, the next reset is the end of the current window
    let monthlyReset: number | undefined;
    if (monthlyRateLimit.windowStart !== undefined) {
      const config = monthlyConfig.config as RateLimitConfig;
      monthlyReset = monthlyRateLimit.windowStart + config.period;
    }

    // Process premium credits (for premium users)
    let premiumLimit = 0;
    let premiumCount = 0;
    let premiumRemaining = 0;
    let premiumReset: number | undefined;

    if (isPremium && premiumStatus && premiumConfig) {
      premiumLimit = RATE_LIMITS.PREMIUM_MONTHLY;
      premiumCount =
        premiumLimit - (premiumStatus.ok ? premiumConfig.value : 0);
      premiumRemaining = premiumStatus.ok ? premiumConfig.value : 0;

      // Use the rate limiter component's own logic for accurate reset time
      const premiumRateLimit = calculateRateLimit(
        { value: premiumConfig.value, ts: premiumConfig.ts },
        premiumConfig.config,
        now,
        0 // Don't consume tokens, just calculate
      );

      // For fixed windows, the next reset is the end of the current window
      if (premiumRateLimit.windowStart !== undefined) {
        const config = premiumConfig.config as RateLimitConfig;
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

// Delete account and all associated data
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // --- Step 1: Fetch all documents that need to be deleted in parallel ---
    const [
      attachments,
      messages,
      chats,
      feedback,
      usage,
      authAccounts,
      authSessions,
    ] = await Promise.all([
      ctx.db
        .query("chat_attachments")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("feedback")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("usage_history")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    // --- Step 2: Collect all deletion promises and execute them concurrently ---
    const deletionPromises: Promise<unknown>[] = [];

    // Delete attachments and their files
    const { R2 } = await import("@convex-dev/r2");
    const { components } = await import("./_generated/api");
    const r2 = new R2(components.r2);
    for (const att of attachments) {
      deletionPromises.push(
        r2.deleteObject(ctx, att.key).catch(() => {
          // Silently handle storage deletion errors
        })
      );
      deletionPromises.push(
        ctx.db.delete(att._id).catch(() => {
          // Silently handle database deletion errors
        })
      );
    }

    // Delete messages
    deletionPromises.push(...messages.map((msg) => ctx.db.delete(msg._id)));

    // Delete chats
    deletionPromises.push(...chats.map((chat) => ctx.db.delete(chat._id)));

    // Delete feedback
    deletionPromises.push(...feedback.map((f) => ctx.db.delete(f._id)));

    // Delete usage history
    deletionPromises.push(...usage.map((u) => ctx.db.delete(u._id)));

    // Delete auth accounts
    deletionPromises.push(
      ...authAccounts.map((acc) => ctx.db.delete(acc._id as Id<"authAccounts">))
    );

    // Delete auth sessions
    deletionPromises.push(
      ...authSessions.map((sess) =>
        ctx.db.delete(sess._id as Id<"authSessions">)
      )
    );

    // Execute all deletions concurrently
    await Promise.allSettled(deletionPromises);

    // Finally delete user record
    await ctx.db.delete(userId);
    return null;
  },
});

// React hook API functions for rate limiting
export const { getRateLimit: getRateLimitHook, getServerTime } =
  rateLimiter.hookAPI(
    "authenticatedDaily", // Default rate limit
    {
      key: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        return userId || "anonymous";
      },
    }
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
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Internal mutation to check rate limits for scheduled tasks
export const assertNotOverLimitInternal = internalMutation({
  args: {
    userId: v.id("users"),
    usesPremiumCredits: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, usesPremiumCredits }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const isPremium = subscription?.status === "active";
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
        const dailyLimitName = isAnonymous
          ? "anonymousDaily"
          : "authenticatedDaily";
        checkPromises.push(
          rateLimiter.check(ctx, dailyLimitName, {
            key: userId,
          })
        );
      }

      // CHECK monthly limits for all users (don't consume yet)
      checkPromises.push(
        rateLimiter.check(ctx, "standardMonthly", {
          key: userId,
        })
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

    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const isPremium = subscription?.status === "active";
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
        const dailyLimitName = isAnonymous
          ? "anonymousDaily"
          : "authenticatedDaily";
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
    const updatedCount = results.filter(
      (result) => result.status === "fulfilled"
    ).length;

    return {
      updatedCount,
      totalCount,
    };
  },
});
