import {
  type AuthFunctions,
  createClient,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { MODEL_DEFAULT, RECOMMENDED_MODELS } from "../lib/config";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimiter";

const siteUrl = process.env.SITE_URL || "http://localhost:3000";

// Auth functions for Better Auth internal use
const authFunctions: AuthFunctions = internal.auth;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth, {
  verbose: false,
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        // CRITICAL: Check if user already exists by email to preserve existing data
        // This is essential for production users with subscriptions and chat history
        if (authUser.email) {
          const existingUser = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("email"), authUser.email))
            .first();

          if (existingUser) {
            // Link Better Auth user to existing user (preserves subscriptions and data!)
            await authComponent.setUserId(ctx, authUser._id, existingUser._id);
            return;
          }
        }

        // Only create new user if no existing one found
        // Create new user in our users table with app-specific preferences only
        // Identity fields (name, email, image, isAnonymous) are managed by Better Auth
        const userId = await ctx.db.insert("users", {
          // Initialize user preferences only
          preferredModel: MODEL_DEFAULT,
          disabledModels: [],
          favoriteModels: [...RECOMMENDED_MODELS],
        });

        // Link Better Auth user to our user
        await authComponent.setUserId(ctx, authUser._id, userId);

        // Initialize rate limits for new user
        try {
          const rateLimitPromises: Promise<unknown>[] = [];

          // Daily limits based on user type from Better Auth
          const isAnonymous = authUser.isAnonymous ?? false;
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
          // Non-fatal: rate-limit initialization failure should never block the user flow
        }
      },
      onUpdate: async (_ctx, _oldUser, _newUser) => {
        // Handle user updates if needed
      },
      onDelete: async (ctx, authUser) => {
        // Clean up when user is deleted
        if (authUser.userId) {
          await ctx.db.delete(authUser.userId as Id<"users">);
        }
      },
    },
  },
});

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false }
) => {
  return betterAuth({
    // Disable logging when createAuth is called just to generate options.
    // This is not required, but there's a lot of noise in logs without it.
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.AUTH_GOOGLE_ID || "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60, // Cache duration in seconds (1 hour)
      },
    },
    plugins: [
      // Anonymous authentication
      anonymous({
        onLinkAccount: () => {
          // When anonymous user links to Google account,
          // the onCreate trigger will handle merging the data
        },
      }),
      // The Convex plugin is required for Convex compatibility (NO crossDomain for Next.js!)
      convex(),
    ],
  });
};

// Export trigger functions for use in other Convex functions
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();
