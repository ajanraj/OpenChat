/**
 * Chat Error Utilities
 * Handles error classification and user-friendly error messages for chat operations
 */

import { isRateLimitError } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { toast } from "@/components/ui/toast";
import { getAllowedLabel, UPLOAD_ALLOWED_MIME, UPLOAD_MAX_LABEL } from "@/lib/config/upload";
import { ERROR_CODES } from "@/lib/error-codes";
import { classifyError, shouldShowAsToast } from "@/lib/error-utils";

/**
 * Maps backend upload error codes to user-friendly messages
 */
export function humaniseUploadError(err: unknown): string {
  // files:generateUploadUrl throws the rate limiter's own error for the fileUpload bucket
  if (isRateLimitError(err)) {
    return "Upload limit reached. Please wait a few minutes before uploading more files.";
  }
  const code = err instanceof ConvexError && typeof err.data === "string" ? err.data : null;
  switch (code) {
    case ERROR_CODES.UNSUPPORTED_MODEL: {
      return "File uploads are not supported for the selected model.";
    }
    case ERROR_CODES.UNSUPPORTED_FILE_TYPE: {
      return `File not supported. Allowed: ${getAllowedLabel(UPLOAD_ALLOWED_MIME)}`;
    }
    case ERROR_CODES.FILE_TOO_LARGE: {
      return `File too large. Max ${UPLOAD_MAX_LABEL} per file`;
    }
    case ERROR_CODES.NOT_AUTHENTICATED: {
      return "Sign in with Google to upload files.";
    }
    default: {
      return "Error uploading file";
    }
  }
}

/**
 * Processes branch operation errors and returns user-friendly messages
 */
export function processBranchError(branchError: unknown): string {
  const errorMsg = branchError instanceof Error ? branchError.message : String(branchError);
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
