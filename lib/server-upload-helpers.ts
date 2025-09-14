/**
 * Server-side Upload Helpers
 * Replicates the useUploadFile hook pattern for server-side usage (API routes)
 */

import { fetchAction, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Server-side equivalent of useUploadFile hook
 * Handles: generateUploadUrl -> upload to R2 -> syncMetadata -> saveMetadata
 */
export async function uploadBlobToR2(
  blob: Blob,
  options: {
    chatId: Id<"chats">;
    fileName?: string;
    token: string;
    isGenerated?: boolean;
  }
): Promise<{
  key: string;
  url?: string;
  fileName: string;
}> {
  // Step 1: Generate upload URL (same as useUploadFile does)
  const { url: uploadUrl, key } = await fetchMutation(
    api.files.generateUploadUrl,
    {},
    { token: options.token }
  );

  // Step 2: Upload to R2 (same as useUploadFile does)
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: {
      // This header will be stored by R2 as ContentType; server-side will still validate on save
      "Content-Type": blob.type || "application/octet-stream",
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload to R2: ${uploadResponse.statusText}`);
  }

  // Step 3: Sync metadata with Convex R2 system (this was missing!)
  await fetchMutation(
    api.files.syncMetadata,
    { key },
    { token: options.token }
  );

  // Step 4: Save custom metadata to chat_attachments table
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
    { token: options.token }
  );

  return {
    key,
    url: savedAttachment.url,
    fileName: savedAttachment.fileName,
  };
}
