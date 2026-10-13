import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimiter";

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
  await Promise.all(messageIds.map((id) => ctx.db.delete("messages", id)));

  return messageIds;
}

/**
 * Deletes an attachment's R2 object and its record. A failed R2 delete is logged (the object is
 * left orphaned) and the record is still removed, so storage errors never block cleanup.
 */
async function deleteAttachment(
  ctx: MutationCtx,
  r2: R2,
  attachment: Doc<"chat_attachments">,
): Promise<void> {
  try {
    await r2.deleteObject(ctx, attachment.key);
  } catch (error) {
    console.error(`Failed to delete R2 object "${attachment.key}"; it is now orphaned:`, error);
  }
  await ctx.db.delete("chat_attachments", attachment._id);
}

/**
 * Deletes all attachments (files and database records) for a given chat.
 * Storage deletion errors are logged and cleanup continues.
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

  await Promise.all(attachments.map((attachment) => deleteAttachment(ctx, r2, attachment)));
}

/**
 * Clears `originalChatId` on chats branched from the specified chat, skipping chats for which
 * `isDeleting` is true (they are deleted by the same operation, so need no patch).
 *
 * @example
 * await removeBranchReferences(ctx, originalChatId, userId);
 */
export async function removeBranchReferences(
  ctx: MutationCtx,
  originalChatId: Id<"chats">,
  userId: Id<"users">,
  isDeleting?: (chat: Doc<"chats">) => boolean,
): Promise<void> {
  const branchedChats = await ctx.db
    .query("chats")
    .withIndex("by_user_and_original_chat", (q) =>
      q.eq("userId", userId).eq("originalChatId", originalChatId),
    )
    .collect();

  await Promise.all(
    branchedChats
      .filter((branchedChat) => !isDeleting?.(branchedChat))
      .map((branchedChat) =>
        ctx.db.patch("chats", branchedChat._id, {
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
  await ctx.db.delete("chats", chatId);
}

/**
 * Deletes the user's sign-in data: auth accounts (with their verification codes) and sessions
 * (with their refresh tokens), so no device can refresh its token afterwards.
 *
 * @example
 * await deleteAuthData(ctx, userId);
 */
export async function deleteAuthData(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  for await (const account of ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))) {
    for await (const code of ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))) {
      await ctx.db.delete("authVerificationCodes", code._id);
    }
    await ctx.db.delete("authAccounts", account._id);
  }

  for await (const session of ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))) {
    for await (const token of ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))) {
      await ctx.db.delete("authRefreshTokens", token._id);
    }
    await ctx.db.delete("authSessions", session._id);
  }
}

const MiB = 1024 * 1024;

// Work one purge run may do before it stops and the next run continues. Kept far below Convex's
// per-transaction limits (16k writes, 4096 queries, 1000 scheduled functions, 16 MiB read and
// written) so each run stays short; the byte reserve leaves room for one more document (<= 1 MiB).
const PURGE_MAX_WRITES = 2000;
const PURGE_MAX_QUERIES = 1000;
const PURGE_MAX_SCHEDULED = 200;
const PURGE_BYTES_RESERVE = 4 * MiB;
// Each R2 delete schedules its own cleanup inside the R2 component, which may not count toward
// this transaction's metrics, so attachments get their own per-run cap.
const PURGE_MAX_ATTACHMENTS = 100;

async function hasPurgeBudget(ctx: MutationCtx): Promise<boolean> {
  const metrics = await ctx.meta.getTransactionMetrics();
  return (
    metrics.documentsWritten.used < PURGE_MAX_WRITES &&
    metrics.databaseQueries.used < PURGE_MAX_QUERIES &&
    metrics.functionsScheduled.used < PURGE_MAX_SCHEDULED &&
    metrics.bytesRead.remaining > PURGE_BYTES_RESERVE &&
    metrics.bytesWritten.remaining > PURGE_BYTES_RESERVE
  );
}

/**
 * Runs `purge` on each row while the run has budget. Returns true once the rows are exhausted,
 * false when the run must stop early (including when `purge` itself returns false).
 */
async function purgeEach<Row>(
  ctx: MutationCtx,
  rows: AsyncIterable<Row>,
  purge: (row: Row) => Promise<boolean>,
): Promise<boolean> {
  for await (const row of rows) {
    if (!((await hasPurgeBudget(ctx)) && (await purge(row)))) {
      return false;
    }
  }
  return true;
}

/**
 * Row deleters for purgeEach. Each purger allows PURGE_MAX_ATTACHMENTS R2 deletes, then stops.
 */
function createPurger(ctx: MutationCtx) {
  const r2 = new R2(components.r2);
  let attachmentsDeleted = 0;
  return {
    // Shared across tables, so it keeps the id-only delete form (the table-first form needs a
    // literal table name per call site)
    deleteRow: async (row: { _id: Id<TableNames> }) => {
      await ctx.db.delete(row._id);
      return true;
    },
    deleteAttachment: async (attachment: Doc<"chat_attachments">) => {
      if (attachmentsDeleted >= PURGE_MAX_ATTACHMENTS) {
        return false;
      }
      attachmentsDeleted += 1;
      await deleteAttachment(ctx, r2, attachment);
      return true;
    },
  };
}

/**
 * Deletes one budget-bounded batch of the user's `chats`, each with its attachments and messages
 * (messages go by chat, which also covers legacy messages without a userId). Branch links are
 * cleared on chats that survive; `isDeleting` says which chats are being deleted too. Returns
 * true once `chats` is exhausted, false when the caller must run it again (a partly deleted chat
 * resumes where it stopped).
 *
 * @example
 * const done = await purgeChatsBatch(ctx, userId, chats, () => true);
 */
export async function purgeChatsBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  chats: AsyncIterable<Doc<"chats">>,
  isDeleting: (chat: Doc<"chats">) => boolean,
): Promise<boolean> {
  const { deleteRow, deleteAttachment } = createPurger(ctx);
  return await purgeEach(ctx, chats, async (chat) => {
    const contentDone =
      (await purgeEach(
        ctx,
        ctx.db.query("chat_attachments").withIndex("by_chatId", (q) => q.eq("chatId", chat._id)),
        deleteAttachment,
      )) &&
      (await purgeEach(
        ctx,
        ctx.db.query("messages").withIndex("by_chat_and_created", (q) => q.eq("chatId", chat._id)),
        deleteRow,
      ));
    if (!contentDone) {
      return false;
    }
    await removeBranchReferences(ctx, chat._id, userId, isDeleting);
    await ctx.db.delete("chats", chat._id);
    return true;
  });
}

/**
 * Deletes one budget-bounded batch of a deleted user's data. Returns true when nothing is left,
 * false when the caller must run it again (each run restarts from the first table; finished
 * tables cost one empty index read). Stripe billing records are kept.
 *
 * @example
 * const done = await purgeUserDataBatch(ctx, userId);
 */
export async function purgeUserDataBatch(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const { deleteRow, deleteAttachment } = createPurger(ctx);

  const steps: Array<() => Promise<boolean>> = [
    // Scheduled tasks first, so no new run starts writing to the user's chats mid-purge
    () =>
      purgeEach(
        ctx,
        ctx.db.query("scheduled_tasks").withIndex("by_user", (q) => q.eq("userId", userId)),
        async (task) => {
          if (task.scheduledFunctionId) {
            try {
              await ctx.scheduler.cancel(task.scheduledFunctionId as Id<"_scheduled_functions">);
            } catch (error) {
              console.error(`Failed to cancel the scheduled run of task ${task._id}:`, error);
            }
          }
          const historyDone = await purgeEach(
            ctx,
            ctx.db
              .query("task_history")
              .withIndex("by_task_and_time", (q) => q.eq("taskId", task._id)),
            deleteRow,
          );
          if (!historyDone) {
            return false;
          }
          return await deleteRow(task);
        },
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("chat_attachments").withIndex("by_userId", (q) => q.eq("userId", userId)),
        deleteAttachment,
      ),
    // Every chat goes, so no branch link needs clearing
    () =>
      purgeChatsBatch(
        ctx,
        userId,
        ctx.db.query("chats").withIndex("by_user", (q) => q.eq("userId", userId)),
        () => true,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("messages").withIndex("by_user", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("feedback").withIndex("by_user", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("usage_history").withIndex("by_user", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("connectors").withIndex("by_user", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
    () =>
      purgeEach(
        ctx,
        ctx.db.query("user_api_keys").withIndex("by_user_provider", (q) => q.eq("userId", userId)),
        deleteRow,
      ),
  ];

  for (const step of steps) {
    if (!(await step())) {
      return false;
    }
  }

  // Rate-limit buckets are keyed by user id; resetting a limit deletes the user's buckets
  await Promise.all(
    Object.keys(rateLimiter.limits ?? {}).map((name) =>
      rateLimiter.reset(ctx, name, { key: userId }),
    ),
  );
  return true;
}
