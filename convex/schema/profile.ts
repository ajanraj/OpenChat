import { v } from "convex/values";

export const Profile = v.object({
  userId: v.id("users"),
  name: v.string(),
  icon: v.string(),
  isDefault: v.boolean(),
  order: v.number(),
  // Personalization
  preferredName: v.optional(v.string()),
  occupation: v.optional(v.string()),
  traits: v.optional(v.string()),
  about: v.optional(v.string()),
  // Model prefs
  preferredModel: v.optional(v.string()),
  disabledModels: v.optional(v.array(v.string())),
  favoriteModels: v.optional(v.array(v.string())),
  // Theme config (JSON stringified ThemeEditorState)
  themeConfig: v.optional(v.string()),
});
