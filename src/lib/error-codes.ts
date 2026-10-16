/**
 * Standardized error codes for ConvexError usage across the application
 */

// Authentication errors
export const AUTH_ERRORS = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
} as const;

// Validation errors
export const VALIDATION_ERRORS = {
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  CHAT_NOT_FOUND: "CHAT_NOT_FOUND",
  MESSAGE_NOT_FOUND: "MESSAGE_NOT_FOUND",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  CONNECTOR_NOT_FOUND: "CONNECTOR_NOT_FOUND",
} as const;

// Rate limiting errors
export const RATE_LIMIT_ERRORS = {
  DAILY_LIMIT_REACHED: "DAILY_LIMIT_REACHED",
  MONTHLY_LIMIT_REACHED: "MONTHLY_LIMIT_REACHED",
  PREMIUM_LIMIT_REACHED: "PREMIUM_LIMIT_REACHED",
} as const;

// Business logic errors
export const BUSINESS_ERRORS = {
  PREMIUM_MODEL_ACCESS_DENIED: "PREMIUM_MODEL_ACCESS_DENIED",
  USER_KEY_REQUIRED: "USER_KEY_REQUIRED",
  UNSUPPORTED_MODEL: "UNSUPPORTED_MODEL",
  UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
  REDACTED_CONTENT: "REDACTED_CONTENT",
  PROFILE_LIMIT_REACHED: "PROFILE_LIMIT_REACHED",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  CANNOT_DELETE_DEFAULT_PROFILE: "CANNOT_DELETE_DEFAULT_PROFILE",
} as const;

// File operation errors
export const FILE_ERRORS = {
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UPLOAD_FAILED: "UPLOAD_FAILED",
} as const;

export const CONNECTOR_ERRORS = {
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONNECTION_NOT_FOUND: "CONNECTION_NOT_FOUND",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  CONNECTOR_NOT_SUPPORTED: "CONNECTOR_NOT_SUPPORTED",
  CONNECTOR_AUTH_FAILED: "CONNECTOR_AUTH_FAILED",
} as const;

export const STREAMING_ERRORS = {
  PROVIDER_STREAM_RATE_LIMIT: "PROVIDER_STREAM_RATE_LIMIT",
  PROVIDER_STREAM_QUOTA_EXCEEDED: "PROVIDER_STREAM_QUOTA_EXCEEDED",
  PROVIDER_STREAM_INSUFFICIENT_BALANCE: "PROVIDER_STREAM_INSUFFICIENT_BALANCE",
  PROVIDER_STREAM_AUTH_ERROR: "PROVIDER_STREAM_AUTH_ERROR",
  PROVIDER_STREAM_TIMEOUT: "PROVIDER_STREAM_TIMEOUT",
  PROVIDER_STREAM_THROTTLED: "PROVIDER_STREAM_THROTTLED",
  PROVIDER_STREAM_RESOURCE_EXHAUSTED: "PROVIDER_STREAM_RESOURCE_EXHAUSTED",
} as const;

// Combined error codes for easy import
export const ERROR_CODES = {
  ...AUTH_ERRORS,
  ...VALIDATION_ERRORS,
  ...RATE_LIMIT_ERRORS,
  ...BUSINESS_ERRORS,
  ...FILE_ERRORS,
  ...CONNECTOR_ERRORS,
  ...STREAMING_ERRORS,
} as const;

// Type for all error codes
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** User-facing message for each error code. */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Auth errors
  [ERROR_CODES.NOT_AUTHENTICATED]: "Authentication required. Please sign in.",
  [ERROR_CODES.UNAUTHORIZED]: "You are not authorized to perform this action.",
  [ERROR_CODES.TOKEN_EXPIRED]:
    "Your session has expired. Please sign in again.",

  // Validation errors
  [ERROR_CODES.INVALID_INPUT]:
    "Invalid input provided. Please check your data.",
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: "Required field is missing.",
  [ERROR_CODES.USER_NOT_FOUND]: "User not found.",
  [ERROR_CODES.CHAT_NOT_FOUND]:
    "Chat not found or you do not have access to it.",
  [ERROR_CODES.MESSAGE_NOT_FOUND]: "Message not found.",
  [ERROR_CODES.FILE_NOT_FOUND]: "File not found.",
  [ERROR_CODES.CONNECTOR_NOT_FOUND]: "Connector not found or not connected.",

  // Rate limit errors
  [ERROR_CODES.DAILY_LIMIT_REACHED]:
    "You have reached your daily usage limit. Please try again tomorrow.",
  [ERROR_CODES.MONTHLY_LIMIT_REACHED]:
    "You have reached your monthly usage limit. Please upgrade your plan.",
  [ERROR_CODES.PREMIUM_LIMIT_REACHED]:
    "You have used all of your premium credits for this month. Your premium credits will reset with your subscription.",

  // Business errors
  [ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED]:
    "This model requires a premium subscription. Please upgrade to access premium models.",
  [ERROR_CODES.USER_KEY_REQUIRED]:
    "This model requires your own API key. Please add your API key in settings.",
  [ERROR_CODES.UNSUPPORTED_MODEL]:
    "The selected model is not supported for this operation.",
  [ERROR_CODES.UNSUPPORTED_OPERATION]: "This operation is not supported.",
  [ERROR_CODES.REDACTED_CONTENT]:
    "Cannot fork chat with redacted content. Forking disabled to maintain conversation integrity.",
  [ERROR_CODES.PROFILE_LIMIT_REACHED]: "Maximum of 5 profiles allowed.",
  [ERROR_CODES.PROFILE_NOT_FOUND]: "Profile not found.",
  [ERROR_CODES.CANNOT_DELETE_DEFAULT_PROFILE]:
    "The default profile cannot be deleted.",

  // File errors
  [ERROR_CODES.UNSUPPORTED_FILE_TYPE]:
    "Unsupported file type. Please upload a supported file format.",
  [ERROR_CODES.FILE_TOO_LARGE]:
    "File is too large. Please upload a smaller file.",
  [ERROR_CODES.UPLOAD_FAILED]: "File upload failed. Please try again.",

  // Connector errors
  [ERROR_CODES.CONNECTION_FAILED]:
    "Failed to establish connection. Please try again.",
  [ERROR_CODES.CONNECTION_NOT_FOUND]:
    "Connection not found. Please reconnect the service.",
  [ERROR_CODES.CONNECTION_TIMEOUT]: "Connection timed out. Please try again.",
  [ERROR_CODES.CONNECTOR_NOT_SUPPORTED]: "This connector is not supported.",
  [ERROR_CODES.CONNECTOR_AUTH_FAILED]:
    "Authentication failed for this connector. Please reconnect.",

  // Streaming errors
  [ERROR_CODES.PROVIDER_STREAM_RATE_LIMIT]:
    "API rate limit exceeded. Please wait a moment before trying again.",
  [ERROR_CODES.PROVIDER_STREAM_QUOTA_EXCEEDED]:
    "API quota exceeded. Please check your billing or add credits to your account.",
  [ERROR_CODES.PROVIDER_STREAM_INSUFFICIENT_BALANCE]:
    "Insufficient API credits. Please add credits to your account.",
  [ERROR_CODES.PROVIDER_STREAM_AUTH_ERROR]:
    "Invalid API key. Please check your API key in settings.",
  [ERROR_CODES.PROVIDER_STREAM_TIMEOUT]:
    "API request timed out. Please try again.",
  [ERROR_CODES.PROVIDER_STREAM_THROTTLED]:
    "API is experiencing high load. Please try again in a moment.",
  [ERROR_CODES.PROVIDER_STREAM_RESOURCE_EXHAUSTED]:
    "API resources exhausted. Please wait before retrying.",
};

const isErrorCode = (code: string): code is ErrorCode =>
  Object.hasOwn(ERROR_MESSAGES, code);

/**
 * User-friendly message for an error code. Accepts any string because callers pass error data
 * from the server; unknown codes get a generic message.
 */
export const getErrorMessage = (code: string): string =>
  isErrorCode(code)
    ? ERROR_MESSAGES[code]
    : "An unexpected error occurred. Please try again.";
