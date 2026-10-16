/**
 * Server-side Upload Helpers
 * Mirrors the browser upload flow (useFileHandling) for server routes, authenticated with the
 * user's Convex token.
 */

import { fetchAction, fetchMutation } from "convex/nextjs";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { uploadToR2 } from "./r2-upload";

/**
 * Uploads a blob for the user and attaches it to their chat:
 * generateUploadUrl -> PUT to R2 -> saveGeneratedImage / saveFileAttachment.
 */
export async function uploadBlobToR2(
  blob: Blob,
  options: {
    chatId: Id<"chats">;
    fileName?: string;
    token: string;
    isGenerated?: boolean;
    /** SERVER_ROUTE_SECRET; lets credit-paid server uploads skip the user's upload rate limit */
    serverSecret?: string;
  }
): Promise<{
  key: string;
  url?: string;
  fileName: string;
}> {
  const auth = { token: options.token };
  const key = await uploadToR2(blob, (args) =>
    fetchMutation(
      api.files.generateUploadUrl,
      { ...args, serverSecret: options.serverSecret },
      auth
    )
  );

  // Syncs R2 metadata, re-validates the stored object, and attaches it to the chat
  const saveAction = options.isGenerated
    ? api.files.saveGeneratedImage
    : api.files.saveFileAttachment;

  const savedAttachment = await fetchAction(
    saveAction,
    {
      key,
      chatId: options.chatId,
      fileName: options.fileName ?? "file",
    },
    auth
  );

  return {
    key,
    url: savedAttachment.url,
    fileName: savedAttachment.fileName,
  };
}
