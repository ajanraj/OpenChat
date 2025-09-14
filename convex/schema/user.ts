import { v } from "convex/values";

export const User = v.object({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  preferredModel: v.optional(v.string()),
  preferredName: v.optional(v.string()),
  occupation: v.optional(v.string()),
  traits: v.optional(v.string()),
  about: v.optional(v.string()),
  disabledModels: v.optional(v.array(v.string())),
  favoriteModels: v.optional(v.array(v.string())),
});
