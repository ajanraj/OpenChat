/**
 * Error classification and handling utilities
 */

import { ConvexError } from "convex/values";
import { z } from "zod";
import { ERROR_CODES, type ErrorCode, getErrorMessage } from "./error-codes";

export type ErrorDisplayType = "conversation" | "toast" | "both";

/**
 * Zod schema for Convex rate limit errors
 */
const ConvexRateLimitErrorSchema = z.object({
  data: z.object({
    kind: z.literal("RateLimitError"),
    name: z.string().optional(),
  }),
});

/**
 * Type guard to check if an error is a ConvexError
 */
function isConvexError(error: unknown): error is ConvexError<string> {
  return error instanceof ConvexError;
}

export type ClassifiedError = {
  displayType: ErrorDisplayType;
  code: string;
  message: string;
  userFriendlyMessage: string;
  httpStatus: number;
  responseType: string;
  originalError?: Error | unknown;
};

/**
 * HTTP status code mapping for different error types
 */
function getHttpStatusForErrorCode(code: string): number {
  switch (code) {
    // Auth errors
    case ERROR_CODES.NOT_AUTHENTICATED:
    case ERROR_CODES.TOKEN_EXPIRED:
      return 401;
    case ERROR_CODES.UNAUTHORIZED:
      return 403;

    // Business errors
    case ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED:
    case ERROR_CODES.PREMIUM_LIMIT_REACHED:
    case ERROR_CODES.DAILY_LIMIT_REACHED:
    case ERROR_CODES.MONTHLY_LIMIT_REACHED:
      return 403;

    // Validation errors
    case ERROR_CODES.INVALID_INPUT:
    case ERROR_CODES.MISSING_REQUIRED_FIELD:
    case ERROR_CODES.UNSUPPORTED_FILE_TYPE:
    case ERROR_CODES.FILE_TOO_LARGE:
      return 400;

    // Resource not found
    case ERROR_CODES.USER_NOT_FOUND:
    case ERROR_CODES.CHAT_NOT_FOUND:
    case ERROR_CODES.MESSAGE_NOT_FOUND:
    case ERROR_CODES.FILE_NOT_FOUND:
      return 404;

    // Business logic errors
    case ERROR_CODES.USER_KEY_REQUIRED:
    case ERROR_CODES.UNSUPPORTED_MODEL:
    case ERROR_CODES.UNSUPPORTED_OPERATION:
      return 400;
    case ERROR_CODES.UPLOAD_FAILED:
      return 500;

    default:
      return 500;
  }
}

/**
 * Get API response type identifier for error code
 */
function getResponseTypeForErrorCode(code: string): string {
  switch (code) {
    // Auth errors
    case ERROR_CODES.NOT_AUTHENTICATED:
      return "auth_error";
    case ERROR_CODES.UNAUTHORIZED:
      return "unauthorized";
    case ERROR_CODES.TOKEN_EXPIRED:
      return "token_expired";

    // Business errors
    case ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED:
      return "premium_access_denied";
    case ERROR_CODES.USER_KEY_REQUIRED:
      return "api_key_required";
    case ERROR_CODES.PREMIUM_LIMIT_REACHED:
    case ERROR_CODES.DAILY_LIMIT_REACHED:
    case ERROR_CODES.MONTHLY_LIMIT_REACHED:
      return "usage_limit";

    // Validation errors
    case ERROR_CODES.INVALID_INPUT:
    case ERROR_CODES.MISSING_REQUIRED_FIELD:
      return "validation_error";
    case ERROR_CODES.UNSUPPORTED_FILE_TYPE:
      return "unsupported_file_type";
    case ERROR_CODES.FILE_TOO_LARGE:
      return "file_too_large";

    // Resource errors
    case ERROR_CODES.USER_NOT_FOUND:
    case ERROR_CODES.CHAT_NOT_FOUND:
    case ERROR_CODES.MESSAGE_NOT_FOUND:
    case ERROR_CODES.FILE_NOT_FOUND:
      return "not_found";

    // Operation errors
    case ERROR_CODES.UNSUPPORTED_MODEL:
      return "unsupported_model";
    case ERROR_CODES.UNSUPPORTED_OPERATION:
      return "unsupported_operation";
    case ERROR_CODES.UPLOAD_FAILED:
      return "upload_failed";

    default:
      return "unknown_error";
  }
}

/**
 * Classify an error and determine how it should be displayed
 */
export function classifyError(error: unknown): ClassifiedError {
  // Handle ConvexError first (our new standardized errors)
  if (isConvexError(error)) {
    const errorCode = error.data as ErrorCode;
    const userFriendlyMessage = getErrorMessage(errorCode);

    // Determine display type based on error code
    const displayType: ErrorDisplayType =
      errorCode === ERROR_CODES.NOT_AUTHENTICATED ||
      errorCode === ERROR_CODES.INVALID_INPUT ||
      errorCode === ERROR_CODES.MISSING_REQUIRED_FIELD
        ? "toast"
        : "conversation";

    return {
      displayType,
      code: errorCode,
      message: errorCode,
      userFriendlyMessage,
      httpStatus: getHttpStatusForErrorCode(errorCode),
      responseType: getResponseTypeForErrorCode(errorCode),
      originalError: error,
    };
  }

  // Handle Convex rate limiter errors
  const rateLimitParseResult = ConvexRateLimitErrorSchema.safeParse(error);
  if (rateLimitParseResult.success) {
    const {
      data: { name },
    } = rateLimitParseResult.data;
    const code = "RATE_LIMIT";
    return {
      displayType: "conversation",
      code,
      message: `Rate limit exceeded. ${name || "Unknown limit"}`,
      userFriendlyMessage: `You've reached your usage limit. Please try again in a moment.`,
      httpStatus: 429,
      responseType: "rate_limit",
      originalError: error,
    };
  }

  // Handle any remaining Error instances or unknown errors
  let errorMsg: string;
  if (error && error instanceof Error) {
    errorMsg = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    errorMsg = String((error as { message: unknown }).message);
  } else {
    errorMsg = String(error);
  }

  // Default: treat as system error
  return {
    displayType: "conversation",
    code: "SYSTEM_ERROR",
    message: errorMsg,
    userFriendlyMessage: "An unexpected error occurred. Please try again.",
    httpStatus: 500,
    responseType: "unknown_error",
    originalError: error,
  };
}

/**
 * Create a standardized API error response
 */
export function createErrorResponse(error: unknown): Response {
  const classified = classifyError(error);

  const errorPayload = {
    error: {
      type: classified.responseType,
      message: classified.userFriendlyMessage,
      code: classified.code,
    },
  };

  return new Response(JSON.stringify(errorPayload), {
    status: classified.httpStatus,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a standardized streaming error for conversation display
 */
export function createStreamingError(error: unknown): {
  shouldSaveToConversation: boolean;
  errorPayload: {
    error: {
      type: string;
      message: string;
    };
  };
} {
  const classified = classifyError(error);

  const errorPayload = {
    error: {
      type: classified.responseType,
      message: classified.userFriendlyMessage,
    },
  };

  return {
    shouldSaveToConversation:
      classified.displayType === "conversation" ||
      classified.displayType === "both",
    errorPayload,
  };
}

/**
 * Create an ErrorUIPart for conversation display
 */
export function createErrorPart(
  code: string,
  message: string,
  rawError?: string
) {
  return {
    type: "error" as const,
    error: {
      code,
      message,
      ...(rawError && { rawError }),
    },
  };
}

/**
 * Check if an error should be displayed in conversation
 */
export function shouldShowInConversation(error: unknown): boolean {
  const classified = classifyError(error);
  return (
    classified.displayType === "conversation" ||
    classified.displayType === "both"
  );
}

/**
 * Check if an error should be displayed as toast
 */
export function shouldShowAsToast(error: unknown): boolean {
  const classified = classifyError(error);
  return (
    classified.displayType === "toast" || classified.displayType === "both"
  );
}
