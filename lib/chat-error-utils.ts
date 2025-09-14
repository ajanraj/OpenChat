/**
 * Chat Error Utilities
 * Handles error classification and user-friendly error messages for chat operations
 */

import { toast } from "@/components/ui/toast";
import {
  getAllowedLabel,
  UPLOAD_ALLOWED_MIME,
  UPLOAD_MAX_LABEL,
} from "@/lib/config/upload";
import { classifyError, shouldShowAsToast } from "@/lib/error-utils";

/**
 * Maps backend upload error codes to user-friendly messages
 */
export function humaniseUploadError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Error uploading file";
  }
  const msg = err.message;
  if (msg.includes("ERR_UNSUPPORTED_MODEL")) {
    return "File uploads are not supported for the selected model.";
  }
  if (msg.includes("ERR_BAD_MIME")) {
    return `File not supported. Allowed: ${getAllowedLabel(UPLOAD_ALLOWED_MIME)}`;
  }
  if (msg.includes("ERR_FILE_TOO_LARGE")) {
    return `File too large. Max ${UPLOAD_MAX_LABEL} per file`;
  }
  return "Error uploading file";
}

/**
 * Processes branch operation errors and returns user-friendly messages
 */
export function processBranchError(branchError: unknown): string {
  const errorMsg =
    branchError instanceof Error ? branchError.message : String(branchError);
  if (errorMsg.includes("Can only branch from assistant messages")) {
    return "You can only branch from assistant messages";
  }
  if (errorMsg.includes("not found")) {
    return "Message not found or chat unavailable";
  }
  if (errorMsg.includes("unauthorized")) {
    return "You don't have permission to branch this chat";
  }
  return "Failed to branch chat";
}

/**
 * Standardized error handler for chat operations
 * Integrates with AI SDK error handling patterns
 */
export function handleChatError(error: Error): void {
  if (shouldShowAsToast(error)) {
    const classified = classifyError(error);
    toast({
      title: classified.userFriendlyMessage,
      status: "error",
    });
  }
}

/**
 * Creates an error callback for useChat hook
 */
export function createChatErrorHandler() {
  return (error: Error) => {
    handleChatError(error);
  };
}
