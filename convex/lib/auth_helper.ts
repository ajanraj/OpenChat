import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ERROR_CODES } from "../../lib/error-codes";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Ensures the user is authenticated and returns their userId.
 * Throws an error if not authenticated.
 *
 * @example
 * const userId = await ensureAuthenticated(ctx);
 */
export async function ensureAuthenticated(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
  }
  return userId;
}

/**
 * Ensures the user has access to the specified chat.
 * Returns the chat document and userId if authorized.
 * Throws an error if unauthorized or chat not found.
 *
 * @example
 * const { chat, userId } = await ensureChatAccess(ctx, chatId);
 */
export async function ensureChatAccess(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">
): Promise<{ chat: Doc<"chats">; userId: Id<"users"> }> {
  const userId = await ensureAuthenticated(ctx);
  const chat = await ctx.db.get(chatId);

  if (!chat || chat.userId !== userId) {
    throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
  }

  return { chat, userId };
}

/**
 * Safely attempts to ensure chat access without throwing.
 * Returns null if unauthorized or chat not found.
 * Useful for operations that should fail silently.
 *
 * @example
 * const result = await tryEnsureChatAccess(ctx, chatId);
 * if (!result) return null;
 * const { chat, userId } = result;
 */
export async function tryEnsureChatAccess(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">
): Promise<{ chat: Doc<"chats">; userId: Id<"users"> } | null> {
  try {
    return await ensureChatAccess(ctx, chatId);
  } catch {
    return null;
  }
}

/**
 * Ensures the user has access to the specified message and its chat.
 * Returns the message, chat, and userId if authorized.
 * Throws an error if unauthorized or not found.
 *
 * @example
 * const { message, chat, userId } = await ensureMessageAccess(ctx, messageId);
 */
export async function ensureMessageAccess(
  ctx: QueryCtx | MutationCtx,
  messageId: Id<"messages">
): Promise<{
  message: Doc<"messages">;
  chat: Doc<"chats">;
  userId: Id<"users">;
}> {
  const userId = await ensureAuthenticated(ctx);
  const message = await ctx.db.get(messageId);

  if (!message) {
    throw new ConvexError(ERROR_CODES.MESSAGE_NOT_FOUND);
  }

  const chat = await ctx.db.get(message.chatId);
  if (!chat || chat.userId !== userId) {
    throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
  }

  return { message, chat, userId };
}

/**
 * Gets the current authenticated user document.
 * Returns null if not authenticated or user not found.
 * Useful for queries that need user data but shouldn't fail.
 *
 * @example
 * const user = await getCurrentUserOrNull(ctx);
 * if (!user) return [];
 */
export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  return await ctx.db.get(userId);
}

/**
 * Gets the current authenticated user document.
 * Throws if not authenticated or user not found.
 *
 * @example
 * const user = await getCurrentUserOrThrow(ctx);
 */
export async function getCurrentUserOrThrow(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const userId = await ensureAuthenticated(ctx);
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
  }

  return user;
}

/**
 * Validates that multiple chats belong to the authenticated user.
 * Returns only the valid chats that the user owns.
 *
 * @example
 * const validChats = await validateChatOwnership(ctx, chatIds);
 */
export async function validateChatOwnership(
  ctx: QueryCtx | MutationCtx,
  chatIds: Id<"chats">[]
): Promise<Doc<"chats">[]> {
  if (chatIds.length === 0) {
    return [];
  }

  const userId = await ensureAuthenticated(ctx);

  // Get all chats in parallel
  const chatResults = await Promise.all(
    chatIds.map((chatId) => ctx.db.get(chatId))
  );

  // Filter to only valid chats owned by the user
  return chatResults.filter(
    (chat): chat is Doc<"chats"> => chat !== null && chat.userId === userId
  );
}
