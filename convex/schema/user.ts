import { v } from "convex/values";

export const User = v.object({
  // Temporarily keep email for migration - allows onCreate trigger to find existing users
  email: v.optional(v.string()),
  // TEMPORARY: Keep these fields as optional for migration - will be removed after cleanup
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  isAnonymous: v.optional(v.boolean()),
  emailVerificationTime: v.optional(v.number()),
  // App-specific user preferences and profile data
  // Other identity fields are managed by Better Auth
  preferredModel: v.optional(v.string()),
  preferredName: v.optional(v.string()),
  occupation: v.optional(v.string()),
  traits: v.optional(v.string()),
  about: v.optional(v.string()),
  disabledModels: v.optional(v.array(v.string())),
  favoriteModels: v.optional(v.array(v.string())),
});
