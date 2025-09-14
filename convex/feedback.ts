import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
// import { Feedback } from './schema/feedback';

export const createFeedback = mutation({
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, { message }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    await ctx.db.insert("feedback", {
      userId,
      message,
      createdAt: Date.now(),
    });
    return null;
  },
});
