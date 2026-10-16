// Centralized upload configuration and helpers
// Single source of truth for allowed MIME types, max size, accept string, and labels.
// Shared by the client (pre-validation) and Convex (files.ts enforces it), so keep imports relative.

import { ERROR_CODES } from "../error-codes";

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

// Max attachment ids accepted by one files.deleteAttachments call; the client batches larger selections
export const ATTACHMENT_DELETE_BATCH_SIZE = 100;

// Extend this list (e.g., add 'image/heic') to allow new types everywhere
export const UPLOAD_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

export type UploadAllowedMime = (typeof UPLOAD_ALLOWED_MIME)[number];

export function isAllowedUploadMime(type: string): type is UploadAllowedMime {
  return (UPLOAD_ALLOWED_MIME as readonly string[]).includes(type);
}

export type UploadPolicyError =
  | typeof ERROR_CODES.UNSUPPORTED_FILE_TYPE
  | typeof ERROR_CODES.FILE_TOO_LARGE
  | typeof ERROR_CODES.INVALID_INPUT;

/**
 * Checks a file's type and byte size against the upload policy.
 * Used for the client-declared values when issuing an upload URL and again for the real
 * R2 metadata before an upload is attached. Returns the ERROR_CODES value to reject with, or null.
 */
export function getUploadPolicyError(file: {
  type: string | undefined;
  size: number | undefined;
}): UploadPolicyError | null {
  if (!(file.type && isAllowedUploadMime(file.type))) {
    return ERROR_CODES.UNSUPPORTED_FILE_TYPE;
  }
  if (file.size === undefined || !Number.isSafeInteger(file.size) || file.size < 0) {
    return ERROR_CODES.INVALID_INPUT;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return ERROR_CODES.FILE_TOO_LARGE;
  }
  return null;
}

// Accept string for <input type="file" accept="...">
export const UPLOAD_ACCEPT: string = [...UPLOAD_ALLOWED_MIME].join(",");

// Allowed image types for paste (clipboard typically provides images only)
export const PASTE_ALLOWED_MIME: readonly UploadAllowedMime[] = UPLOAD_ALLOWED_MIME.filter((t) =>
  t.startsWith("image/"),
);

// Human-friendly labels derived from MIME types
const MIME_LABEL_MAP: Readonly<Record<string, string>> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "application/pdf": "PDF",
};

export function getAllowedLabel(mimes: readonly string[] = UPLOAD_ALLOWED_MIME): string {
  const labels = [...new Set(mimes.map((t) => MIME_LABEL_MAP[t] ?? t))];
  if (labels.length <= 1) {
    return labels.join(", ");
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / k ** i).toFixed(2);
  return `${value} ${sizes[i]}`;
}

export const UPLOAD_MAX_LABEL = formatBytes(UPLOAD_MAX_BYTES);
