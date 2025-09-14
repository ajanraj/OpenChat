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
} as const;

// File operation errors
export const FILE_ERRORS = {
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UPLOAD_FAILED: "UPLOAD_FAILED",
} as const;

// Combined error codes for easy import
export const ERROR_CODES = {
  ...AUTH_ERRORS,
  ...VALIDATION_ERRORS,
  ...RATE_LIMIT_ERRORS,
  ...BUSINESS_ERRORS,
  ...FILE_ERRORS,
} as const;

// Type for all error codes
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// Helper function to create user-friendly error messages
export function getErrorMessage(code: ErrorCode): string {
  switch (code) {
    // Auth errors
    case ERROR_CODES.NOT_AUTHENTICATED:
      return "Authentication required. Please sign in.";
    case ERROR_CODES.UNAUTHORIZED:
      return "You are not authorized to perform this action.";
    case ERROR_CODES.TOKEN_EXPIRED:
      return "Your session has expired. Please sign in again.";

    // Validation errors
    case ERROR_CODES.INVALID_INPUT:
      return "Invalid input provided. Please check your data.";
    case ERROR_CODES.MISSING_REQUIRED_FIELD:
      return "Required field is missing.";
    case ERROR_CODES.USER_NOT_FOUND:
      return "User not found.";
    case ERROR_CODES.CHAT_NOT_FOUND:
      return "Chat not found or you do not have access to it.";
    case ERROR_CODES.MESSAGE_NOT_FOUND:
      return "Message not found.";
    case ERROR_CODES.FILE_NOT_FOUND:
      return "File not found.";
    case ERROR_CODES.CONNECTOR_NOT_FOUND:
      return "Connector not found or not connected.";

    // Rate limit errors
    case ERROR_CODES.DAILY_LIMIT_REACHED:
      return "You have reached your daily usage limit. Please try again tomorrow.";
    case ERROR_CODES.MONTHLY_LIMIT_REACHED:
      return "You have reached your monthly usage limit. Please upgrade your plan.";
    case ERROR_CODES.PREMIUM_LIMIT_REACHED:
      return "You have used all of your premium credits for this month. Your premium credits will reset with your subscription.";

    // Business errors
    case ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED:
      return "This model requires a premium subscription. Please upgrade to access premium models.";
    case ERROR_CODES.USER_KEY_REQUIRED:
      return "This model requires your own API key. Please add your API key in settings.";
    case ERROR_CODES.UNSUPPORTED_MODEL:
      return "The selected model is not supported for this operation.";
    case ERROR_CODES.UNSUPPORTED_OPERATION:
      return "This operation is not supported.";
    case ERROR_CODES.REDACTED_CONTENT:
      return "Cannot fork chat with redacted content. Forking disabled to maintain conversation integrity.";

    // File errors
    case ERROR_CODES.UNSUPPORTED_FILE_TYPE:
      return "Unsupported file type. Please upload a supported file format.";
    case ERROR_CODES.FILE_TOO_LARGE:
      return "File is too large. Please upload a smaller file.";
    case ERROR_CODES.UPLOAD_FAILED:
      return "File upload failed. Please try again.";

    default:
      return "An unexpected error occurred. Please try again.";
  }
}
