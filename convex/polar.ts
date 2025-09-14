import { Polar } from "@convex-dev/polar";
import { ConvexError } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import { api, components } from "./_generated/api";

export const polar = new Polar(components.polar, {
  getUserInfo: async (
    ctx
  ): Promise<{ userId: string; email: string; name?: string }> => {
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.email) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    // Get the user's display name (preferredName > name > fallback)
    const displayName = user.preferredName || user.name || "User";

    return {
      userId: user._id,
      email: user.email,
      name: displayName,
    };
  },
  products: {
    premium:
      process.env.POLAR_PREMIUM_PRODUCT_ID ||
      (() => {
        throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
      })(),
  },
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();
