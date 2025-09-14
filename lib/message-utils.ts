/**
 * Message Processing Utilities
 * Helper functions for message handling, validation, and processing
 */

import type { UIMessage } from "@ai-sdk/react";
import { toast } from "@/components/ui/toast";
import type { Doc } from "@/convex/_generated/dataModel";
import { convertConvexToAISDK } from "@/lib/ai-sdk-utils";
import { MESSAGE_MAX_LENGTH } from "@/lib/config";

/**
 * Maps Convex message doc to AI SDK message type
 */
export function mapMessage(msg: Doc<"messages">): UIMessage {
  return convertConvexToAISDK(msg);
}

/**
 * Validates input message
 */
export function validateInput(
  inputMessage: string,
  filesCount = 0,
  userId?: string
): boolean {
  if (!inputMessage.trim() && filesCount === 0) {
    return false;
  }

  if (!userId) {
    toast({ title: "User not found. Please sign in.", status: "error" });
    return false;
  }

  if (inputMessage.length > MESSAGE_MAX_LENGTH) {
    toast({
      title: `Message is too long (max ${MESSAGE_MAX_LENGTH} chars).`,
      status: "error",
    });
    return false;
  }

  return true;
}

/**
 * Validates and trims query parameter
 */
export function validateQueryParam(query: string): string | null {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    toast({ title: "Query cannot be empty", status: "error" });
    return null;
  }

  if (trimmedQuery.length > MESSAGE_MAX_LENGTH) {
    toast({
      title: `Query is too long (max ${MESSAGE_MAX_LENGTH} characters).`,
      status: "error",
    });
    return null;
  }

  return trimmedQuery;
}

/**
 * Creates a temporary message ID
 */
export function createTempMessageId(): string {
  return `temp-${Date.now()}`;
}

/**
 * Creates a placeholder message ID
 */
export function createPlaceholderId(): string {
  return `placeholder-${Date.now()}`;
}
