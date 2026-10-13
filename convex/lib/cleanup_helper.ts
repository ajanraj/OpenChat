import { R2 } from "@convex-dev/r2";
import { components, internal } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimiter";

// Presigned PUT URLs from r2.generateUploadUrl use the AWS presigner default of 900 seconds, and
// they don't sign the content type or length: until expiry the client can PUT the key again.
const UPLOAD_URL_LIFETIME_MS = 15 * 60 * 1000;
// Keys are re-checked this long after their URL expires, so uploads still in flight have landed.
const RECHECK_MARGIN_MS = 60 * 1000;

/**
 * When to re-check an attachment's R2 key: just after the upload URL issued with its row (at
 * `_creationTime`) expires. Null once that has passed, since the object can no longer change.
 */
export function uploadRecheckTime(attachment: Doc<"chat_attachments">): number | null {
  const recheckAt = attachment._creationTime + UPLOAD_URL_LIFETIME_MS + RECHECK_MARGIN_MS;
  return recheckAt > Date.now() ? recheckAt : null;
}

/**
 * Call whenever an attachment row that may still have a live upload URL is deleted. Until the URL
 * expires the client can PUT the key again, re-creating the object with no row left to clean it
 * up, so this schedules files.enforceAttachmentPolicy (which deletes objects no row references)
 * for after it expires. Rows older than the URL lifetime schedule nothing.
 */
export async function scheduleDeletedUploadCheck(
  ctx: MutationCtx,
  attachment: Doc<"chat_attachments">,
): Promise<void> {
  const recheckAt = uploadRecheckTime(attachment);
  if (recheckAt !== null) {
    await ctx.scheduler.runAt(recheckAt, internal.files.enforceAttachmentPolicy, {
      key: attachment.key,
    });
  }
}

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
 * Deletes an attachment's R2 object and its record (see scheduleDeletedUploadCheck). A failed R2
 * delete is logged (the object is left orphaned) and the record is still removed, so storage
 * errors never block cleanup.
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
  await scheduleDeletedUploadCheck(ctx, attachment);
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
 * Clears `originalChatId` on the user's chats branched from the specified chat, all in one go;
 * purgeChatsBatch unlinks branches within its budget instead.
 *
 * @example
 * await removeBranchReferences(ctx, originalChatId, userId);
 */
export async function removeBranchReferences(
  ctx: MutationCtx,
  originalChatId: Id<"chats">,
  userId: Id<"users">,
): Promise<void> {
  const branchedChats = await ctx.db
    .query("chats")
    .withIndex("by_user_and_original_chat", (q) =>
      q.eq("userId", userId).eq("originalChatId", originalChatId),
    )
    .collect();

  await Promise.all(
    branchedChats.map((branchedChat) =>
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
 * Deletes the user's auth accounts (with their verification codes), so nobody can sign in to the
 * account again. Its sessions can be too many for one transaction (Convex Auth creates one per
 * sign-in and keeps every used refresh token), so purgeUserDataBatch deletes them first instead.
 *
 * @example
 * await deleteAuthAccounts(ctx, userId);
 */
export async function deleteAuthAccounts(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
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
 * Deletes one budget-bounded batch of the user's `chats`. A chat goes once its attachments and
 * messages are deleted (messages go by chat, which also covers legacy messages without a userId)
 * and, with `unlinkBranches`, once every chat branched from it has lost its `originalChatId`.
 * Pass `unlinkBranches: false` only when every chat of the user goes (no links to keep valid).
 * Returns true once `chats` is exhausted, false when the caller must run it again (a partly
 * deleted chat resumes where it stopped).
 *
 * @example
 * const done = await purgeChatsBatch(ctx, userId, chats, true);
 */
export async function purgeChatsBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  chats: AsyncIterable<Doc<"chats">>,
  unlinkBranches: boolean,
): Promise<boolean> {
  const { deleteRow, deleteAttachment } = createPurger(ctx);
  return await purgeEach(ctx, chats, async (chat) => {
    const done =
      (await purgeEach(
        ctx,
        ctx.db.query("chat_attachments").withIndex("by_chatId", (q) => q.eq("chatId", chat._id)),
        deleteAttachment,
      )) &&
      (await purgeEach(
        ctx,
        ctx.db.query("messages").withIndex("by_chat_and_created", (q) => q.eq("chatId", chat._id)),
        deleteRow,
      )) &&
      (!unlinkBranches ||
        (await purgeEach(
          ctx,
          ctx.db
            .query("chats")
            .withIndex("by_user_and_original_chat", (q) =>
              q.eq("userId", userId).eq("originalChatId", chat._id),
            ),
          async (branch) => {
            // Also unlinks branches being deleted too: the patch moves each branch out of this
            // index range, so a resumed run never re-reads it
            await ctx.db.patch("chats", branch._id, {
              originalChatId: undefined,
              updatedAt: Date.now(),
            });
            return true;
          },
        )));
    if (!done) {
      return false;
    }
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
    // Sessions first: once one is gone, Convex Auth rejects its refresh tokens, so no device can
    // renew its access. Its tokens go before it, so a resumed run still finds the session.
    () =>
      purgeEach(
        ctx,
        ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)),
        async (session) =>
          (await purgeEach(
            ctx,
            ctx.db
              .query("authRefreshTokens")
              .withIndex("sessionId", (q) => q.eq("sessionId", session._id)),
            deleteRow,
          )) && (await deleteRow(session)),
      ),
    // Scheduled tasks next, so no new run starts writing to the user's chats mid-purge
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
    () =>
      purgeChatsBatch(
        ctx,
        userId,
        ctx.db.query("chats").withIndex("by_user", (q) => q.eq("userId", userId)),
        // Every chat of the user goes, so no branch link needs clearing
        false,
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
