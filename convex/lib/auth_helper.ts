import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { ERROR_CODES } from "../../src/lib/error-codes";
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
  const chat = await ctx.db.get("chats", chatId);

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
  const message = await ctx.db.get("messages", messageId);

  if (!message) {
    throw new ConvexError(ERROR_CODES.MESSAGE_NOT_FOUND);
  }

  const chat = await ctx.db.get("chats", message.chatId);
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
  return await ctx.db.get("users", userId);
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
  const user = await ctx.db.get("users", userId);

  if (!user) {
    throw new ConvexError(ERROR_CODES.USER_NOT_FOUND);
  }

  return user;
}

/**
 * Compares two strings in time that depends only on the expected length,
 * so response timing does not reveal how many leading characters matched.
 */
function constantTimeEqual(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(expected);
  let diff = providedBytes.length ^ expectedBytes.length;
  for (const [index, byte] of expectedBytes.entries()) {
    diff |= (providedBytes[index] ?? 0) ^ byte;
  }
  return diff === 0;
}

/**
 * Ensures a call comes from the app's own server routes rather than a browser.
 * Server routes forward the user's session token, so user auth alone cannot tell
 * them apart; they also pass SERVER_ROUTE_SECRET, which only the web server and
 * this deployment know. Refuses every call while the secret is not configured.
 *
 * @example
 * assertServerSecret(args.serverSecret);
 */
export function assertServerSecret(provided: string): void {
  const expected = process.env.SERVER_ROUTE_SECRET;
  if (!(expected && constantTimeEqual(provided, expected))) {
    throw new ConvexError(ERROR_CODES.UNAUTHORIZED);
  }
}
