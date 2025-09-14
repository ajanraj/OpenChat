// Filename validation & sanitization utilities

const MAX_FILENAME_LENGTH = 200; // Reasonable UI-friendly cap while keeping extension
const INVALID_FILENAME_PUNCT = /[<>:"/\\|?*]/g; // Reserved punctuation
const WHITESPACE_RE = /\s+/g;
const JUST_DOTS_RE = /^\.+$/;
const TRAILING_SPACES_DOTS_RE = /[ .]+$/g;

const RESERVED_BASENAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      out += ch;
    }
  }
  return out;
}

export function sanitizeAndValidateFileName(input: string): string {
  // Normalize and trim
  const normalized = (input ?? "").normalize("NFKC").trim();
  // Remove control chars and forbidden punctuation
  const noCtrl = stripControlChars(normalized);
  const cleaned = noCtrl
    .replace(INVALID_FILENAME_PUNCT, "_")
    .replace(WHITESPACE_RE, " ");
  // Disallow names that are just dots or empty after cleaning
  let candidate = cleaned.replace(JUST_DOTS_RE, "").trim();
  if (candidate.length === 0) {
    candidate = "file";
  }

  // Split base and extension (preserve last extension if present)
  const lastDot = candidate.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < candidate.length - 1; // dot not first/last
  const base = (hasExt ? candidate.slice(0, lastDot) : candidate).trim();
  const ext = hasExt ? candidate.slice(lastDot + 1).trim() : "";

  // Trim trailing dots/spaces from base and ext FIRST
  let safeBase = base.replace(TRAILING_SPACES_DOTS_RE, "");
  const safeExt = ext.replace(TRAILING_SPACES_DOTS_RE, "");

  // If trimming yields empty string, set to 'file' before reserved-name check
  if (safeBase.length === 0) {
    safeBase = "file";
  }

  // Now check reserved names on the TRIMMED base (case-insensitive)
  const baseLower = safeBase.toLowerCase();
  if (RESERVED_BASENAMES.has(baseLower)) {
    safeBase = `${safeBase}-file`;
  }

  // Enforce max length while keeping extension if possible
  const extWithDot = safeExt ? `.${safeExt}` : "";
  const maxBaseLen = Math.max(1, MAX_FILENAME_LENGTH - extWithDot.length);
  if (safeBase.length > maxBaseLen) {
    safeBase = safeBase.slice(0, maxBaseLen);
    // If we sliced to whitespace, collapse
    safeBase = safeBase.trim();
    if (safeBase.length === 0) {
      safeBase = "file";
    }
  }

  // Reassemble
  const result = `${safeBase}${extWithDot}`;
  // Final guard against empty/oversized
  if (result.length === 0) {
    return "file";
  }
  if (result.length > MAX_FILENAME_LENGTH) {
    return result.slice(0, MAX_FILENAME_LENGTH);
  }
  return result;
}

export const __filenameUtilsTesting__ = {
  MAX_FILENAME_LENGTH,
};
