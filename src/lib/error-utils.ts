/**
 * Error classification and handling utilities
 */

import { ConvexError } from "convex/values";
import { z } from "zod";

import { ERROR_CODES, getErrorMessage } from "./error-codes";
import type { DetectedError } from "./provider-error-detector";

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
const isConvexError = (error: unknown): error is ConvexError<string> =>
  error instanceof ConvexError;

/**
 * Type guard to check if an error is a DetectedError from provider error detection
 */
const isDetectedError = (error: unknown): error is DetectedError =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  "provider" in error &&
  "message" in error &&
  "userFriendlyMessage" in error;

export interface ClassifiedError {
  displayType: ErrorDisplayType;
  code: string;
  message: string;
  userFriendlyMessage: string;
  httpStatus: number;
  responseType: string;
  originalError?: unknown;
}

const HTTP_STATUS_BY_CODE = new Map<string, number>([
  // Auth errors
  [ERROR_CODES.NOT_AUTHENTICATED, 401],
  [ERROR_CODES.TOKEN_EXPIRED, 401],
  [ERROR_CODES.UNAUTHORIZED, 403],
  // Business errors
  [ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED, 403],
  [ERROR_CODES.PREMIUM_LIMIT_REACHED, 403],
  [ERROR_CODES.DAILY_LIMIT_REACHED, 403],
  [ERROR_CODES.MONTHLY_LIMIT_REACHED, 403],
  // Validation errors
  [ERROR_CODES.INVALID_INPUT, 400],
  [ERROR_CODES.MISSING_REQUIRED_FIELD, 400],
  [ERROR_CODES.UNSUPPORTED_FILE_TYPE, 400],
  [ERROR_CODES.FILE_TOO_LARGE, 400],
  // Resource not found
  [ERROR_CODES.USER_NOT_FOUND, 404],
  [ERROR_CODES.CHAT_NOT_FOUND, 404],
  [ERROR_CODES.MESSAGE_NOT_FOUND, 404],
  [ERROR_CODES.FILE_NOT_FOUND, 404],
  // Business logic errors
  [ERROR_CODES.USER_KEY_REQUIRED, 400],
  [ERROR_CODES.UNSUPPORTED_MODEL, 400],
  [ERROR_CODES.UNSUPPORTED_OPERATION, 400],
  [ERROR_CODES.UPLOAD_FAILED, 500],
  // Connector errors
  [ERROR_CODES.CONNECTION_NOT_FOUND, 404],
  [ERROR_CODES.CONNECTOR_NOT_SUPPORTED, 400],
  [ERROR_CODES.CONNECTOR_AUTH_FAILED, 401],
  [ERROR_CODES.CONNECTION_FAILED, 500],
  [ERROR_CODES.CONNECTION_TIMEOUT, 500],
  // Streaming errors
  [ERROR_CODES.PROVIDER_STREAM_RATE_LIMIT, 429],
  [ERROR_CODES.PROVIDER_STREAM_THROTTLED, 429],
  [ERROR_CODES.PROVIDER_STREAM_RESOURCE_EXHAUSTED, 429],
  [ERROR_CODES.PROVIDER_STREAM_QUOTA_EXCEEDED, 402],
  [ERROR_CODES.PROVIDER_STREAM_INSUFFICIENT_BALANCE, 402],
  [ERROR_CODES.PROVIDER_STREAM_AUTH_ERROR, 401],
  [ERROR_CODES.PROVIDER_STREAM_TIMEOUT, 408],
]);

/**
 * HTTP status code mapping for different error types (500 for unknown codes)
 */
const getHttpStatusForErrorCode = (code: string): number =>
  HTTP_STATUS_BY_CODE.get(code) ?? 500;

const RESPONSE_TYPE_BY_CODE = new Map<string, string>([
  // Auth errors
  [ERROR_CODES.NOT_AUTHENTICATED, "auth_error"],
  [ERROR_CODES.UNAUTHORIZED, "unauthorized"],
  [ERROR_CODES.TOKEN_EXPIRED, "token_expired"],
  // Business errors
  [ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED, "premium_access_denied"],
  [ERROR_CODES.USER_KEY_REQUIRED, "api_key_required"],
  [ERROR_CODES.PREMIUM_LIMIT_REACHED, "usage_limit"],
  [ERROR_CODES.DAILY_LIMIT_REACHED, "usage_limit"],
  [ERROR_CODES.MONTHLY_LIMIT_REACHED, "usage_limit"],
  // Validation errors
  [ERROR_CODES.INVALID_INPUT, "validation_error"],
  [ERROR_CODES.MISSING_REQUIRED_FIELD, "validation_error"],
  [ERROR_CODES.UNSUPPORTED_FILE_TYPE, "unsupported_file_type"],
  [ERROR_CODES.FILE_TOO_LARGE, "file_too_large"],
  // Resource errors
  [ERROR_CODES.USER_NOT_FOUND, "not_found"],
  [ERROR_CODES.CHAT_NOT_FOUND, "not_found"],
  [ERROR_CODES.MESSAGE_NOT_FOUND, "not_found"],
  [ERROR_CODES.FILE_NOT_FOUND, "not_found"],
  // Operation errors
  [ERROR_CODES.UNSUPPORTED_MODEL, "unsupported_model"],
  [ERROR_CODES.UNSUPPORTED_OPERATION, "unsupported_operation"],
  [ERROR_CODES.UPLOAD_FAILED, "upload_failed"],
  // Connector errors
  [ERROR_CODES.CONNECTION_FAILED, "connection_failed"],
  [ERROR_CODES.CONNECTION_NOT_FOUND, "connection_not_found"],
  [ERROR_CODES.CONNECTION_TIMEOUT, "connection_timeout"],
  [ERROR_CODES.CONNECTOR_NOT_SUPPORTED, "connector_not_supported"],
  [ERROR_CODES.CONNECTOR_AUTH_FAILED, "connector_auth_failed"],
  // Streaming errors
  [ERROR_CODES.PROVIDER_STREAM_RATE_LIMIT, "provider_rate_limit"],
  [ERROR_CODES.PROVIDER_STREAM_QUOTA_EXCEEDED, "provider_quota_exceeded"],
  [
    ERROR_CODES.PROVIDER_STREAM_INSUFFICIENT_BALANCE,
    "provider_insufficient_balance",
  ],
  [ERROR_CODES.PROVIDER_STREAM_AUTH_ERROR, "provider_auth_error"],
  [ERROR_CODES.PROVIDER_STREAM_TIMEOUT, "provider_timeout"],
  [ERROR_CODES.PROVIDER_STREAM_THROTTLED, "provider_throttled"],
  [
    ERROR_CODES.PROVIDER_STREAM_RESOURCE_EXHAUSTED,
    "provider_resource_exhausted",
  ],
]);

/**
 * Get API response type identifier for error code
 */
const getResponseTypeForErrorCode = (code: string): string =>
  RESPONSE_TYPE_BY_CODE.get(code) ?? "unknown_error";

/**
 * Create a classified error from a detected streaming error
 */
export const classifyStreamingError = (detectedError: {
  type: string;
  provider: string;
  message: string;
  userFriendlyMessage: string;
  isRateLimit?: boolean;
  isQuotaExceeded?: boolean;
  isInsufficientBalance?: boolean;
  isAuthError?: boolean;
}): ClassifiedError => {
  // Map detected error types to error codes
  let code: string;
  if (detectedError.isRateLimit === true) {
    code = "PROVIDER_STREAM_RATE_LIMIT";
  } else if (detectedError.isQuotaExceeded === true) {
    code = "PROVIDER_STREAM_QUOTA_EXCEEDED";
  } else if (detectedError.isInsufficientBalance === true) {
    code = "PROVIDER_STREAM_INSUFFICIENT_BALANCE";
  } else if (detectedError.isAuthError === true) {
    code = "PROVIDER_STREAM_AUTH_ERROR";
  } else {
    code = "PROVIDER_STREAM_THROTTLED";
  }

  // Determine display type - streaming errors should be shown in conversation
  const displayType: ErrorDisplayType = "conversation";

  return {
    displayType,
    code,
    message: detectedError.message,
    userFriendlyMessage: detectedError.userFriendlyMessage,
    httpStatus: getHttpStatusForErrorCode(code),
    responseType: getResponseTypeForErrorCode(code),
    originalError: detectedError,
  };
};

/**
 * Classify an error and determine how it should be displayed
 */
export const classifyError = (error: unknown): ClassifiedError => {
  // Handle DetectedError from provider error detection first
  if (isDetectedError(error)) {
    // Use the existing classifyStreamingError function which handles DetectedError properly
    return classifyStreamingError(error);
  }

  // Handle ConvexError second (our new standardized errors)
  if (isConvexError(error)) {
    const errorCode = error.data;
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
      message: `Rate limit exceeded. ${name !== undefined && name !== "" ? name : "Unknown limit"}`,
      userFriendlyMessage: `You've reached your usage limit. Please try again in a moment.`,
      httpStatus: 429,
      responseType: "rate_limit",
      originalError: error,
    };
  }

  // Handle any remaining Error instances or unknown errors
  let errorMsg: string;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "message" in error
  ) {
    errorMsg = String(error.message);
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
};

/**
 * Create a standardized API error response
 */
export const createErrorResponse = (error: unknown): Response => {
  const classified = classifyError(error);

  const errorPayload = {
    error: {
      type: classified.responseType,
      message: classified.userFriendlyMessage,
      code: classified.code,
    },
  };

  return Response.json(errorPayload, {
    status: classified.httpStatus,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Create a standardized streaming error for conversation display
 */
export const createStreamingError = (
  error: unknown
): {
  shouldSaveToConversation: boolean;
  errorPayload: {
    error: {
      type: string;
      message: string;
    };
  };
} => {
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
};

/**
 * Create an ErrorUIPart for conversation display
 */
export const createErrorPart = (
  code: string,
  message: string,
  rawError?: string
) => ({
  type: "error" as const,
  error: {
    code,
    message,
    ...(rawError !== undefined && rawError !== "" ? { rawError } : {}),
  },
});

/**
 * Check if an error should be displayed in conversation
 */
export const shouldShowInConversation = (error: unknown): boolean => {
  const classified = classifyError(error);
  return (
    classified.displayType === "conversation" ||
    classified.displayType === "both"
  );
};

/**
 * Check if an error should be displayed as toast
 */
export const shouldShowAsToast = (error: unknown): boolean => {
  const classified = classifyError(error);
  return (
    classified.displayType === "toast" || classified.displayType === "both"
  );
};

/**
 * Create an ErrorUIPart from a detected streaming error
 */
export const createErrorPartFromDetectedError = (detectedError: {
  type: string;
  provider: string;
  message: string;
  userFriendlyMessage: string;
  isRateLimit?: boolean;
  isQuotaExceeded?: boolean;
  isInsufficientBalance?: boolean;
  isAuthError?: boolean;
}) => {
  const classified = classifyStreamingError(detectedError);
  return createErrorPart(
    classified.code,
    classified.userFriendlyMessage,
    detectedError.message
  );
};
