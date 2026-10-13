"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { cancelBillableSubscriptions } from "./stripe";

const REVOKE_MAX_ATTEMPTS = 5;
const REVOKE_RETRY_BASE_MS = 30_000;

/**
 * Revokes what a deleted user still has outside Convex: cancels their billable Stripe
 * subscriptions and deletes their Composio connected accounts (live OAuth grants). Scheduled by
 * users.deleteAccount. Both steps are idempotent, so a failure of either retries both with
 * exponential backoff before giving up with an error log.
 */
export const revokeDeletedUserAccess = internalAction({
  args: { userId: v.id("users"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { userId, attempt = 1 }): Promise<null> => {
    const results = await Promise.allSettled([
      cancelBillableSubscriptions(ctx, userId),
      // Imported lazily: the module throws at load without COMPOSIO_API_KEY, which must not
      // block the Stripe cancel
      import("../src/lib/composio-server").then(({ disconnectAccount }) =>
        disconnectAccount(userId),
      ),
    ]);
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length === 0) {
      return null;
    }

    const error = new AggregateError(failures, failures.map(String).join("; "));
    if (attempt >= REVOKE_MAX_ATTEMPTS) {
      console.error(
        `Giving up revoking access of deleted user ${userId} after ${attempt} attempts; cancel their Stripe subscriptions and delete their Composio connected accounts by hand:`,
        error,
      );
      throw error;
    }
    console.warn(
      `Revoking access of deleted user ${userId} failed (attempt ${attempt}); retrying:`,
      error,
    );
    await ctx.scheduler.runAfter(
      REVOKE_RETRY_BASE_MS * 2 ** (attempt - 1),
      internal.account_deletion.revokeDeletedUserAccess,
      { userId, attempt: attempt + 1 },
    );
    return null;
  },
});
