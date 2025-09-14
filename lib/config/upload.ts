// Centralized upload configuration and helpers
// Single source of truth for allowed MIME types, max size, accept string, and labels

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

// Extend this list (e.g., add 'image/heic') to allow new types everywhere
export const UPLOAD_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

export type UploadAllowedMime = (typeof UPLOAD_ALLOWED_MIME)[number];

// Accept string for <input type="file" accept="...">
export const UPLOAD_ACCEPT: string = Array.from(UPLOAD_ALLOWED_MIME).join(",");

// Allowed image types for paste (clipboard typically provides images only)
export const PASTE_ALLOWED_MIME: readonly UploadAllowedMime[] =
  UPLOAD_ALLOWED_MIME.filter((t) => t.startsWith("image/"));

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

export function getAllowedLabel(
  mimes: readonly string[] = UPLOAD_ALLOWED_MIME
): string {
  const labels = Array.from(new Set(mimes.map((t) => MIME_LABEL_MAP[t] ?? t)));
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
