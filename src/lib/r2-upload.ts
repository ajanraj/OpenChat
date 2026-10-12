/**
 * R2 upload step shared by the browser (useFileHandling) and server routes (uploadBlobToR2).
 */

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

type GenerateUploadUrlRef = typeof api.files.generateUploadUrl;

/** files.generateUploadUrl bound to a caller (a React mutation or a token-authenticated fetch). */
export type GenerateUploadUrl = (
  args: FunctionArgs<GenerateUploadUrlRef>,
) => Promise<FunctionReturnType<GenerateUploadUrlRef>>;

/**
 * Reserves an upload with files.generateUploadUrl (checks type/size, rate-limits, records a
 * pending row), then PUTs the blob to the presigned R2 URL. Returns the object key, which must be
 * finalized with files.saveFileAttachment or files.saveGeneratedImage within an hour.
 */
export async function uploadToR2(
  blob: Blob,
  generateUploadUrl: GenerateUploadUrl,
): Promise<string> {
  const { key, url } = await generateUploadUrl({ contentType: blob.type, size: blob.size });
  const response = await fetch(url, {
    method: "PUT",
    body: blob,
    // R2 stores this as the object's content type, which the server re-checks on save.
    headers: { "Content-Type": blob.type },
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}`);
  }
  return key;
}
