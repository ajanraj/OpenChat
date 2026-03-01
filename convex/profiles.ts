import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { MODEL_DEFAULT } from "../src/lib/config";
import { ERROR_CODES } from "../src/lib/error-codes";
import { internalQuery, mutation, query } from "./_generated/server";
import { Profile } from "./schema/profile";

const MAX_PROFILES = 5;

export const listProfiles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      ...Profile.fields,
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return profiles.sort((a, b) => a.order - b.order);
  },
});

export const getProfile = query({
  args: { profileId: v.id("profiles") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      ...Profile.fields,
    }),
  ),
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return null;
    }
    return profile;
  },
});

export const getProfileInternal = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      ...Profile.fields,
    }),
  ),
  handler: async (ctx, { profileId }) => {
    return await ctx.db.get(profileId);
  },
});

export const ensureDefaultProfile = mutation({
  args: {
    themeConfig: v.optional(v.string()),
  },
  returns: v.id("profiles"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    // Check if default already exists
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user_and_default", (q) => q.eq("userId", userId).eq("isDefault", true))
      .first();

    if (existing) {
      return existing._id;
    }

    // Copy current user settings into default profile
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
    }

    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Default",
      icon: "ChatCircle",
      isDefault: true,
      order: 0,
      preferredName: user.preferredName,
      occupation: user.occupation,
      traits: user.traits,
      about: user.about,
      preferredModel: user.preferredModel,
      disabledModels: user.disabledModels,
      favoriteModels: user.favoriteModels,
      themeConfig: args.themeConfig,
    });

    // Set as active profile
    await ctx.db.patch(userId, { activeProfileId: profileId });

    return profileId;
  },
});

export const createProfile = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
    copyFromProfileId: v.optional(v.id("profiles")),
  },
  returns: v.id("profiles"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    if (!args.name.trim()) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }

    // Count existing profiles
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (existing.length >= MAX_PROFILES) {
      throw new ConvexError(ERROR_CODES.PROFILE_LIMIT_REACHED);
    }

    // Copy from source profile if specified
    let copyData: Partial<{
      preferredName: string;
      occupation: string;
      traits: string;
      about: string;
      preferredModel: string;
      disabledModels: string[];
      favoriteModels: string[];
      themeConfig: string;
    }> = {};

    if (args.copyFromProfileId) {
      const source = await ctx.db.get(args.copyFromProfileId);
      if (source && source.userId === userId) {
        copyData = {
          preferredName: source.preferredName,
          occupation: source.occupation,
          traits: source.traits,
          about: source.about,
          preferredModel: source.preferredModel,
          disabledModels: source.disabledModels,
          favoriteModels: source.favoriteModels,
          themeConfig: source.themeConfig,
        };
      }
    }

    const maxOrder = existing.reduce((max, p) => Math.max(max, p.order), -1);

    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: args.name.trim(),
      icon: args.icon,
      isDefault: false,
      order: maxOrder + 1,
      ...copyData,
    });

    return profileId;
  },
});

export const updateProfile = mutation({
  args: {
    profileId: v.id("profiles"),
    updates: v.object({
      name: v.optional(v.string()),
      icon: v.optional(v.string()),
      preferredName: v.optional(v.string()),
      occupation: v.optional(v.string()),
      traits: v.optional(v.string()),
      about: v.optional(v.string()),
      preferredModel: v.optional(v.string()),
      disabledModels: v.optional(v.array(v.string())),
      favoriteModels: v.optional(v.array(v.string())),
      themeConfig: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { profileId, updates }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
      updates = { ...updates, name: trimmed };
    }

    if (updates.favoriteModels !== undefined && updates.favoriteModels.length === 0) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    await ctx.db.patch(profileId, updates);
    return null;
  },
});

export const deleteProfile = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    if (profile.isDefault) {
      throw new ConvexError(ERROR_CODES.CANNOT_DELETE_DEFAULT_PROFILE);
    }

    // Find default profile to reassign chats
    const defaultProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_and_default", (q) => q.eq("userId", userId).eq("isDefault", true))
      .first();

    // Reassign orphaned chats to default profile
    const orphanedChats = await ctx.db
      .query("chats")
      .withIndex("by_user_and_profile", (q) => q.eq("userId", userId).eq("profileId", profileId))
      .collect();

    for (const chat of orphanedChats) {
      await ctx.db.patch(chat._id, {
        profileId: defaultProfile?._id,
      });
    }

    // Delete the profile
    await ctx.db.delete(profileId);

    // If user's active profile was the deleted one, switch to default
    const user = await ctx.db.get(userId);
    if (user?.activeProfileId === profileId && defaultProfile) {
      await ctx.db.patch(userId, {
        activeProfileId: defaultProfile._id,
      });
    }

    return null;
  },
});

export const setActiveProfile = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    await ctx.db.patch(userId, { activeProfileId: profileId });
    return null;
  },
});

export const setProfileModelEnabled = mutation({
  args: { profileId: v.id("profiles"), modelId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { profileId, modelId, enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    if (!enabled && modelId === MODEL_DEFAULT) {
      return null;
    }

    const currentFavorites = profile.favoriteModels ?? [];
    const currentDisabled = profile.disabledModels ?? [];
    const isCurrentlyDisabled = currentDisabled.includes(modelId);

    let newFavorites = currentFavorites;
    let newDisabled: string[];

    if (enabled) {
      newDisabled = currentDisabled.filter((id) => id !== modelId);
    } else {
      newDisabled = isCurrentlyDisabled
        ? currentDisabled
        : [...new Set([...currentDisabled, modelId])];
      newFavorites = currentFavorites.filter((id) => id !== modelId);

      if (newFavorites.length === 0 && currentFavorites.length > 0) {
        const firstFavorite = currentFavorites[0];
        newFavorites = [firstFavorite];
        newDisabled = newDisabled.filter((id) => id !== firstFavorite);
      }
    }

    await ctx.db.patch(profileId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const bulkSetProfileModelsDisabled = mutation({
  args: { profileId: v.id("profiles"), modelIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { profileId, modelIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    const currentFavorites = profile.favoriteModels ?? [];
    const currentDisabled = profile.disabledModels ?? [];
    const modelsToDisable = modelIds.filter((id) => id !== MODEL_DEFAULT);

    let newFavorites: string[];
    let newDisabled: string[];

    if (modelsToDisable.length === 0) {
      newDisabled = [];
      newFavorites = currentFavorites;
    } else {
      newFavorites = currentFavorites.filter((id) => !modelsToDisable.includes(id));
      newDisabled = [...new Set([...currentDisabled, ...modelsToDisable])];

      if (newFavorites.length === 0 && currentFavorites.length > 0) {
        const firstFavorite = currentFavorites[0];
        newFavorites = [firstFavorite];
        newDisabled = newDisabled.filter((id) => id !== firstFavorite);
      }
    }

    await ctx.db.patch(profileId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const toggleProfileFavoriteModel = mutation({
  args: { profileId: v.id("profiles"), modelId: v.string() },
  returns: v.null(),
  handler: async (ctx, { profileId, modelId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    const currentFavorites = profile.favoriteModels ?? [];
    const currentDisabled = profile.disabledModels ?? [];
    const isFavorite = currentFavorites.includes(modelId);

    let newFavorites: string[];
    let newDisabled: string[];

    if (isFavorite) {
      if (currentFavorites.length <= 1) {
        return null;
      }
      newFavorites = currentFavorites.filter((id) => id !== modelId);
      newDisabled = currentDisabled;
    } else {
      newFavorites = [...new Set([...currentFavorites, modelId])];
      newDisabled = currentDisabled.filter((id) => id !== modelId);
    }

    await ctx.db.patch(profileId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});

export const bulkSetProfileFavoriteModels = mutation({
  args: { profileId: v.id("profiles"), modelIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { profileId, modelIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError(ERROR_CODES.PROFILE_NOT_FOUND);
    }

    if (modelIds.length === 0) {
      throw new ConvexError(ERROR_CODES.MISSING_REQUIRED_FIELD);
    }

    const currentDisabled = profile.disabledModels ?? [];
    const newFavorites = [...new Set(modelIds)];
    const newDisabled = currentDisabled.filter((id) => !newFavorites.includes(id));

    await ctx.db.patch(profileId, {
      favoriteModels: newFavorites,
      disabledModels: newDisabled,
    });

    return null;
  },
});
