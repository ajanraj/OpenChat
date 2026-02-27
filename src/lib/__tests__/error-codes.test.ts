import { describe, expect, it } from "vitest";
import { ERROR_CODES, getErrorMessage } from "../error-codes";

describe("ERROR_CODES", () => {
  it("includes all authentication error codes", () => {
    expect(ERROR_CODES.NOT_AUTHENTICATED).toBe("NOT_AUTHENTICATED");
    expect(ERROR_CODES.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ERROR_CODES.TOKEN_EXPIRED).toBe("TOKEN_EXPIRED");
  });

  it("includes all validation error codes", () => {
    expect(ERROR_CODES.INVALID_INPUT).toBe("INVALID_INPUT");
    expect(ERROR_CODES.MISSING_REQUIRED_FIELD).toBe("MISSING_REQUIRED_FIELD");
    expect(ERROR_CODES.USER_NOT_FOUND).toBe("USER_NOT_FOUND");
    expect(ERROR_CODES.CHAT_NOT_FOUND).toBe("CHAT_NOT_FOUND");
    expect(ERROR_CODES.MESSAGE_NOT_FOUND).toBe("MESSAGE_NOT_FOUND");
    expect(ERROR_CODES.FILE_NOT_FOUND).toBe("FILE_NOT_FOUND");
  });

  it("includes all rate limit error codes", () => {
    expect(ERROR_CODES.DAILY_LIMIT_REACHED).toBe("DAILY_LIMIT_REACHED");
    expect(ERROR_CODES.MONTHLY_LIMIT_REACHED).toBe("MONTHLY_LIMIT_REACHED");
    expect(ERROR_CODES.PREMIUM_LIMIT_REACHED).toBe("PREMIUM_LIMIT_REACHED");
  });

  it("includes all business error codes", () => {
    expect(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED).toBe("PREMIUM_MODEL_ACCESS_DENIED");
    expect(ERROR_CODES.USER_KEY_REQUIRED).toBe("USER_KEY_REQUIRED");
    expect(ERROR_CODES.UNSUPPORTED_MODEL).toBe("UNSUPPORTED_MODEL");
    expect(ERROR_CODES.PROFILE_LIMIT_REACHED).toBe("PROFILE_LIMIT_REACHED");
    expect(ERROR_CODES.PROFILE_NOT_FOUND).toBe("PROFILE_NOT_FOUND");
    expect(ERROR_CODES.CANNOT_DELETE_DEFAULT_PROFILE).toBe("CANNOT_DELETE_DEFAULT_PROFILE");
  });

  it("includes all file error codes", () => {
    expect(ERROR_CODES.UNSUPPORTED_FILE_TYPE).toBe("UNSUPPORTED_FILE_TYPE");
    expect(ERROR_CODES.FILE_TOO_LARGE).toBe("FILE_TOO_LARGE");
    expect(ERROR_CODES.UPLOAD_FAILED).toBe("UPLOAD_FAILED");
  });

  it("includes all connector error codes", () => {
    expect(ERROR_CODES.CONNECTION_FAILED).toBe("CONNECTION_FAILED");
    expect(ERROR_CODES.CONNECTION_NOT_FOUND).toBe("CONNECTION_NOT_FOUND");
    expect(ERROR_CODES.CONNECTION_TIMEOUT).toBe("CONNECTION_TIMEOUT");
    expect(ERROR_CODES.CONNECTOR_NOT_SUPPORTED).toBe("CONNECTOR_NOT_SUPPORTED");
    expect(ERROR_CODES.CONNECTOR_AUTH_FAILED).toBe("CONNECTOR_AUTH_FAILED");
  });

  it("includes all streaming error codes", () => {
    expect(ERROR_CODES.PROVIDER_STREAM_RATE_LIMIT).toBe("PROVIDER_STREAM_RATE_LIMIT");
    expect(ERROR_CODES.PROVIDER_STREAM_QUOTA_EXCEEDED).toBe("PROVIDER_STREAM_QUOTA_EXCEEDED");
    expect(ERROR_CODES.PROVIDER_STREAM_INSUFFICIENT_BALANCE).toBe(
      "PROVIDER_STREAM_INSUFFICIENT_BALANCE",
    );
    expect(ERROR_CODES.PROVIDER_STREAM_AUTH_ERROR).toBe("PROVIDER_STREAM_AUTH_ERROR");
    expect(ERROR_CODES.PROVIDER_STREAM_TIMEOUT).toBe("PROVIDER_STREAM_TIMEOUT");
  });
});

describe("getErrorMessage", () => {
  it("returns correct message for auth errors", () => {
    expect(getErrorMessage(ERROR_CODES.NOT_AUTHENTICATED)).toBe(
      "Authentication required. Please sign in.",
    );
    expect(getErrorMessage(ERROR_CODES.UNAUTHORIZED)).toBe(
      "You are not authorized to perform this action.",
    );
    expect(getErrorMessage(ERROR_CODES.TOKEN_EXPIRED)).toBe(
      "Your session has expired. Please sign in again.",
    );
  });

  it("returns correct message for validation errors", () => {
    expect(getErrorMessage(ERROR_CODES.INVALID_INPUT)).toBe(
      "Invalid input provided. Please check your data.",
    );
    expect(getErrorMessage(ERROR_CODES.USER_NOT_FOUND)).toBe("User not found.");
    expect(getErrorMessage(ERROR_CODES.CHAT_NOT_FOUND)).toBe(
      "Chat not found or you do not have access to it.",
    );
  });

  it("returns correct message for rate limit errors", () => {
    expect(getErrorMessage(ERROR_CODES.DAILY_LIMIT_REACHED)).toBe(
      "You have reached your daily usage limit. Please try again tomorrow.",
    );
    expect(getErrorMessage(ERROR_CODES.MONTHLY_LIMIT_REACHED)).toBe(
      "You have reached your monthly usage limit. Please upgrade your plan.",
    );
  });

  it("returns correct message for business errors", () => {
    expect(getErrorMessage(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED)).toBe(
      "This model requires a premium subscription. Please upgrade to access premium models.",
    );
    expect(getErrorMessage(ERROR_CODES.USER_KEY_REQUIRED)).toBe(
      "This model requires your own API key. Please add your API key in settings.",
    );
    expect(getErrorMessage(ERROR_CODES.PROFILE_LIMIT_REACHED)).toBe(
      "Maximum of 5 profiles allowed.",
    );
    expect(getErrorMessage(ERROR_CODES.PROFILE_NOT_FOUND)).toBe("Profile not found.");
    expect(getErrorMessage(ERROR_CODES.CANNOT_DELETE_DEFAULT_PROFILE)).toBe(
      "The default profile cannot be deleted.",
    );
  });

  it("returns correct message for file errors", () => {
    expect(getErrorMessage(ERROR_CODES.UNSUPPORTED_FILE_TYPE)).toBe(
      "Unsupported file type. Please upload a supported file format.",
    );
    expect(getErrorMessage(ERROR_CODES.FILE_TOO_LARGE)).toBe(
      "File is too large. Please upload a smaller file.",
    );
    expect(getErrorMessage(ERROR_CODES.UPLOAD_FAILED)).toBe(
      "File upload failed. Please try again.",
    );
  });

  it("returns correct message for connector errors", () => {
    expect(getErrorMessage(ERROR_CODES.CONNECTION_FAILED)).toBe(
      "Failed to establish connection. Please try again.",
    );
    expect(getErrorMessage(ERROR_CODES.CONNECTOR_AUTH_FAILED)).toBe(
      "Authentication failed for this connector. Please reconnect.",
    );
  });

  it("returns correct message for streaming errors", () => {
    expect(getErrorMessage(ERROR_CODES.PROVIDER_STREAM_RATE_LIMIT)).toBe(
      "API rate limit exceeded. Please wait a moment before trying again.",
    );
    expect(getErrorMessage(ERROR_CODES.PROVIDER_STREAM_AUTH_ERROR)).toBe(
      "Invalid API key. Please check your API key in settings.",
    );
  });

  it("returns default message for unknown error codes", () => {
    const unknownCode = "UNKNOWN_ERROR" as never;
    expect(getErrorMessage(unknownCode)).toBe("An unexpected error occurred. Please try again.");
  });
});
