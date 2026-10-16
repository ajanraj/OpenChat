import { convexToJson, getConvexSize } from "convex/values";
import type { Value } from "convex/values";

import { limitDepth } from "./depth-limiter";
import type { DepthLimitedValue } from "./depth-limiter";

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
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/u;

const isStoredPart = (part: unknown): part is StoredPart =>
  typeof part === "object" && part !== null;

const isToolPart = (part: StoredPart): boolean =>
  typeof part.type === "string" &&
  (part.type.startsWith("tool-") || part.type === "dynamic-tool");

/** Whether `value` has the shape of a Convex value; convexToJson still checks field names. */
const isConvexValueShape = (value: unknown): value is Value => {
  if (
    value === null ||
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    value instanceof ArrayBuffer
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.every((item) => isConvexValueShape(item));
  }
  return (
    typeof value === "object" &&
    Object.values(value).every(
      (field) => field === undefined || isConvexValueShape(field)
    )
  );
};

/** Convex size of a value, or null when Convex cannot store it (e.g. `$`-prefixed or non-ASCII keys). */
const storableSize = (value: unknown): number | null => {
  try {
    if (!isConvexValueShape(value)) {
      return null;
    }
    convexToJson(value);
    return getConvexSize(value);
  } catch {
    return null;
  }
};

const toPreview = (
  value: unknown,
  originalSize: number
): CompactedToolPayload => {
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
};

/**
 * Prepares assistant message parts for saveAssistantMessage. Limits nesting depth, then
 * replaces tool inputs/outputs with a short JSON preview only where saving would fail:
 * - payloads Convex cannot store at all (reserved `$` or non-ASCII field names), and
 * - the largest payloads first, while parts plus `content` exceed MESSAGE_SIZE_BUDGET_BYTES.
 * Messages within the budget are stored unchanged. Oversized text or reasoning is left
 * as is, so the save still fails loudly in that case.
 */
export const compactMessagePartsForStorage = (
  parts: readonly object[],
  content = ""
): DepthLimitedValue[] => {
  // Same as limitDepth(parts, 14), whose items sit at depth 1. limitDepth returns fresh copies,
  // so the parts below can be updated in place.
  const stored = parts.map((part) => limitDepth(part, 14, 1));

  const payloads: ToolPayload[] = [];
  for (const storedPart of stored) {
    if (!(isStoredPart(storedPart) && isToolPart(storedPart))) {
      continue;
    }
    const part: StoredPart = storedPart;
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

  const partsSize = storableSize(stored);
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
};
