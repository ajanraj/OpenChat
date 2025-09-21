import { internalMutation } from "../_generated/server";

export const removeDuplicateUserFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all users
    const allUsers = await ctx.db.query("users").collect();

    // Update each user to remove duplicate fields
    const updatePromises = allUsers.map(async (user) => {
      // Keep only the fields we want in the custom table
      const cleanedUser = {
        // Keep app-specific fields only
        preferredModel: user.preferredModel,
        preferredName: user.preferredName,
        occupation: user.occupation,
        traits: user.traits,
        about: user.about,
        disabledModels: user.disabledModels || [],
        favoriteModels: user.favoriteModels || [],
        // Keep email temporarily for migration
        email: user.email,
      };

      // Remove fields that will be managed by Better Auth
      // This will remove: name, image, isAnonymous, emailVerificationTime
      await ctx.db.replace(user._id, cleanedUser);
    });

    await Promise.all(updatePromises);

    return { processedUsers: allUsers.length };
  },
});
