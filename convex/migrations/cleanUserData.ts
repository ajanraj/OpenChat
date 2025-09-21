import { internalMutation } from "../_generated/server";

export const cleanUserData = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all users
    const allUsers = await ctx.db.query("users").collect();

    // Update each user to remove duplicate fields that Better Auth now manages
    const updatePromises = allUsers.map(async (user) => {
      // Remove fields that will be managed by Better Auth using ctx.db.patch
      await ctx.db.patch(user._id, {
        name: undefined, // Better Auth manages this
        image: undefined, // Better Auth manages this
        isAnonymous: undefined, // Better Auth manages this
        emailVerificationTime: undefined, // Better Auth manages this
      });
    });

    await Promise.all(updatePromises);

    return { processedUsers: allUsers.length };
  },
});
