import type {
  FileUIPart,
  ReasoningFileUIPart,
  ReasoningUIPart,
  SourceUrlUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
} from "ai";

import type { Doc } from "../../convex/_generated/dataModel";

// Type alias for message parts array
type MessageParts = (
  | TextUIPart
  | ReasoningUIPart
  | ReasoningFileUIPart
  | ToolUIPart
  | SourceUrlUIPart
  | FileUIPart
)[];

// Compile regex once at module level for performance
const CONVEX_STORAGE_ID_REGEX = /^[a-z0-9]{32}$/u;

// AI SDK Attachment type
export interface Attachment {
  name?: string;
  contentType?: string;
  url: string;
  storageId?: string;
}

/** A tool invocation in the legacy (AI SDK v4) shape createPartsFromAIResponse accepts. */
interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: "call" | "result" | "partial-call";
}

/** A tool part built from a ToolInvocation; it keeps the legacy `state` values. */
export interface LegacyToolPart {
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolInvocation["state"];
  input: unknown;
  output: unknown;
}

/** True for a non-empty string. */
const isNonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

/**
 * Helper to detect if a string is a Convex storage ID
 */
export const isConvexStorageId = (value: string): boolean =>
  // Convex storage IDs are typically 32-character hex strings
  CONVEX_STORAGE_ID_REGEX.test(value) &&
  !value.startsWith("http") &&
  !value.startsWith("data:") &&
  !value.startsWith("blob:");

/**
 * Extract attachment objects from FileParts
 * Handles both storage IDs and generated URLs from queries
 */
export const extractAttachmentsFromParts = (
  parts?: MessageParts
): Attachment[] | undefined => {
  if (!parts) {
    return undefined;
  }

  const attachments = parts
    .filter((part): part is FileUIPart => part.type === "file")
    .map((part) => ({
      name: part.filename,
      contentType: part.mediaType,
      url: part.url,
      storageId: isConvexStorageId(part.url) ? part.url : undefined,
    }));

  return attachments.length > 0 ? attachments : undefined;
};

/**
 * Convert uploaded file attachments to FileParts for storage
 */
export const convertAttachmentsToFileParts = (
  attachments: Attachment[]
): FileUIPart[] =>
  attachments.map((att) => ({
    type: "file" as const,
    // Use storage ID if available, fallback to URL for backwards compatibility
    url: isNonEmpty(att.storageId) ? att.storageId : att.url,
    mediaType: isNonEmpty(att.contentType)
      ? att.contentType
      : "application/octet-stream",
    filename: att.name,
  }));

/**
 * Extract reasoning text from AI SDK response parts
 */
export const extractReasoningFromResponse = (
  responseParts?: MessageParts
): string | undefined => {
  if (!responseParts) {
    return undefined;
  }

  const reasoningText = responseParts
    .filter((part): part is ReasoningUIPart => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n");

  return isNonEmpty(reasoningText) ? reasoningText : undefined;
};

/**
 * Extract reasoning text from parts array (for backward compatibility display)
 */
export const extractReasoningFromParts = (
  parts?: MessageParts
): string | undefined => {
  if (!parts) {
    return undefined;
  }

  const reasoningPart = parts.find(
    (part): part is ReasoningUIPart => part.type === "reasoning"
  );

  return reasoningPart?.text;
};

/**
 * Create parts from AI response content including tool invocations
 */
export const createPartsFromAIResponse = (
  textContent: string,
  reasoningText?: string,
  toolInvocations?: ToolInvocation[]
): (MessageParts[number] | LegacyToolPart)[] => {
  const parts: (MessageParts[number] | LegacyToolPart)[] = [
    { type: "text", text: textContent },
  ];

  if (isNonEmpty(reasoningText)) {
    parts.push({
      type: "reasoning",
      text: reasoningText,
    });
  }

  // Add tool invocations as parts
  if (toolInvocations && toolInvocations.length > 0) {
    for (const invocation of toolInvocations) {
      parts.push({
        type: `tool-${invocation.toolName}`,
        toolCallId: invocation.toolCallId,
        state: invocation.state,
        input: invocation.args,
        output: invocation.result,
      });
    }
  }

  return parts;
};

const isMessagePart = (part: unknown): boolean =>
  typeof part === "object" &&
  part !== null &&
  "type" in part &&
  typeof part.type === "string";

/** True for an array of `{ type: string }` parts, the shape stored in `messages.parts`. */
const isMessagePartList = (value: unknown): value is UIMessage["parts"] =>
  Array.isArray(value) && value.every(isMessagePart);

/**
 * Convert Convex message document to AI SDK UIMessage format
 */
export const convertConvexToAISDK = (msg: Doc<"messages">): UIMessage => ({
  id: msg._id,
  role: msg.role,
  parts: isMessagePartList(msg.parts) ? msg.parts : [],
  metadata: msg.metadata,
});
