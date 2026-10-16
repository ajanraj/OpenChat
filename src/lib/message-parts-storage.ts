import { convexToJson, getConvexSize } from 'convex/values';
import type { Value } from 'convex/values';
import { limitDepth } from "./depth-limiter";

/**
 * Convex rejects documents over 1 MiB. A message's parts plus its duplicated text
 * content must fit in this budget, which leaves headroom for ids and metadata.
 */
export const MESSAGE_SIZE_BUDGET_BYTES = 900_000;

/** Characters of JSON kept when a tool payload is replaced by a preview. */
export const TOOL_PAYLOAD_PREVIEW_CHARS = 2000;

/** Stored in place of a tool input/output that was too large (or invalid) to save. */
export interface CompactedToolPayload {
  truncated: true;
  /** Convex size in bytes of the original payload; 0 when Convex could not store it. */
  originalSize: number;
  /** Start of the original payload's JSON. */
  preview: string;
}

type StoredPart = Record<string, unknown>;

interface ToolPayload {
  part: StoredPart;
  key: "input" | "output";
  size: number;
}

const TOOL_PAYLOAD_KEYS = ["input", "output"] as const;
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

function isToolPart(part: StoredPart): boolean {
  return (
    typeof part.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool")
  );
}

/** Convex size of a value, or null when Convex cannot store it (e.g. `$`-prefixed or non-ASCII keys). */
function storableSize(value: unknown): number | null {
  try {
    convexToJson(value as Value);
    return getConvexSize(value as Value);
  } catch {
    return null;
  }
}

function toPreview(value: unknown, originalSize: number): CompactedToolPayload {
  let json: string;
  try {
    json = JSON.stringify(value) ?? String(value);
  } catch {
    json = String(value);
  }
  let preview = json.slice(0, TOOL_PAYLOAD_PREVIEW_CHARS);
  // Don't keep half of a surrogate pair at the cut
  if (TRAILING_HIGH_SURROGATE.test(preview)) {
    preview = preview.slice(0, -1);
  }
  return { truncated: true, originalSize, preview };
}

/**
 * Prepares assistant message parts for saveAssistantMessage. Limits nesting depth, then
 * replaces tool inputs/outputs with a short JSON preview only where saving would fail:
 * - payloads Convex cannot store at all (reserved `$` or non-ASCII field names), and
 * - the largest payloads first, while parts plus `content` exceed MESSAGE_SIZE_BUDGET_BYTES.
 * Messages within the budget are stored unchanged. Oversized text or reasoning is left
 * as is, so the save still fails loudly in that case.
 */
export function compactMessagePartsForStorage<T extends object>(parts: T[], content = ""): T[] {
  // limitDepth returns fresh copies, so the parts below can be updated in place
  const stored = limitDepth(parts, 14);
  const storedParts = stored as StoredPart[];

  const payloads: ToolPayload[] = [];
  for (const part of storedParts) {
    if (!isToolPart(part)) {
      continue;
    }
    for (const key of TOOL_PAYLOAD_KEYS) {
      const value = part[key];
      if (value === undefined) {
        continue;
      }
      const size = storableSize(value);
      if (size === null) {
        part[key] = toPreview(value, 0);
      } else {
        payloads.push({ part, key, size });
      }
    }
  }

  const partsSize = storableSize(storedParts);
  if (partsSize === null) {
    return stored;
  }

  let totalSize = partsSize + getConvexSize(content);
  payloads.sort((a, b) => b.size - a.size);
  for (const { part, key, size } of payloads) {
    if (totalSize <= MESSAGE_SIZE_BUDGET_BYTES) {
      break;
    }
    const preview = toPreview(part[key], size);
    part[key] = preview;
    totalSize -= size - (storableSize(preview) ?? 0);
  }

  return stored;
}
