import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Deletes all messages for a given chat.
 * Returns the deleted message IDs.
 *
 * @example
 * await deleteMessagesForChat(ctx, chatId);
 */
export async function deleteMessagesForChat(
  ctx: MutationCtx,
  chatId: Id<"chats">,
): Promise<Id<"messages">[]> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_chat_and_created", (q) => q.eq("chatId", chatId))
    .collect();

  const messageIds = messages.map((m) => m._id);

  // Delete all messages in parallel
  await Promise.all(messageIds.map((id) => ctx.db.delete(id)));

  return messageIds;
}

/**
 * Deletes all attachments (files and database records) for a given chat.
 * Silently handles storage deletion errors to ensure cleanup continues.
 *
 * @example
 * await deleteAttachmentsForChat(ctx, chatId);
 */
export async function deleteAttachmentsForChat(
  ctx: MutationCtx,
  chatId: Id<"chats">,
): Promise<void> {
  const r2 = new R2(components.r2);
  const attachments = await ctx.db
    .query("chat_attachments")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .collect();

  // Delete files from storage and database records in parallel
  await Promise.all(
    attachments.map(async (attachment) => {
      try {
        // Delete the actual file from R2 first
        await r2.deleteObject(ctx, attachment.key);
      } catch {
        // Silently handle storage deletion errors
        // Continue with DB cleanup even if storage deletion fails
      }
      // Then delete the database record
      await ctx.db.delete(attachment._id);
    }),
  );
}

/**
 * Clears `originalChatId` on chats branched from the specified chat, skipping chats in
 * `skipChatIds` (ones deleted in the same operation, which need no patch).
 *
 * @example
 * await removeBranchReferences(ctx, originalChatId, userId);
 */
export async function removeBranchReferences(
  ctx: MutationCtx,
  originalChatId: Id<"chats">,
  userId: Id<"users">,
  skipChatIds?: ReadonlySet<Id<"chats">>,
): Promise<void> {
  const branchedChats = await ctx.db
    .query("chats")
    .withIndex("by_user_and_original_chat", (q) =>
      q.eq("userId", userId).eq("originalChatId", originalChatId),
    )
    .collect();

  await Promise.all(
    branchedChats
      .filter((branchedChat) => !skipChatIds?.has(branchedChat._id))
      .map((branchedChat) =>
        ctx.db.patch(branchedChat._id, {
          originalChatId: undefined,
          updatedAt: Date.now(),
        }),
      ),
  );
}

/**
 * Completely deletes a chat and all its associated data.
 * This includes messages, attachments, and branch references.
 *
 * @example
 * await deleteChatCompletely(ctx, chatId, userId);
 */
export async function deleteChatCompletely(
  ctx: MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<void> {
  // Remove branch references first
  await removeBranchReferences(ctx, chatId, userId);

  // Delete messages and attachments in parallel
  await Promise.all([deleteMessagesForChat(ctx, chatId), deleteAttachmentsForChat(ctx, chatId)]);

  // Finally delete the chat itself
  await ctx.db.delete(chatId);
}

/**
 * Deletes multiple chats and all their associated data in parallel.
 * Branch links are only cleared on chats that survive the deletion.
 *
 * @example
 * await deleteMultipleChats(ctx, validChats, userId);
 */
export async function deleteMultipleChats(
  ctx: MutationCtx,
  chats: Doc<"chats">[],
  userId: Id<"users">,
): Promise<void> {
  const deletingChatIds = new Set(chats.map((chat) => chat._id));
  await Promise.all(
    chats.map((chat) => removeBranchReferences(ctx, chat._id, userId, deletingChatIds)),
  );

  // Process all chat deletions in parallel
  await Promise.all(
    chats.map(async (chat) => {
      // Delete messages and attachments in parallel for each chat
      await Promise.all([
        deleteMessagesForChat(ctx, chat._id),
        deleteAttachmentsForChat(ctx, chat._id),
      ]);

      // Delete the chat
      await ctx.db.delete(chat._id);
    }),
  );
}
