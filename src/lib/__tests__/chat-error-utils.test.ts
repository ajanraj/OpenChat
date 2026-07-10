import { describe, expect, it, vi } from "vitest";
import type { toast } from "@/components/ui/toast";
import type { classifyError, shouldShowAsToast } from "@/lib/error-utils";
import {
  createChatErrorHandler,
  humaniseUploadError,
  processBranchError,
} from "../chat-error-utils";

// Mock toast and error-utils
vi.mock("@/components/ui/toast", () => ({
  toast: vi.fn<typeof toast>(),
}));

vi.mock("@/lib/error-utils", () => ({
  classifyError: vi.fn<typeof classifyError>(() => ({
    code: "unknown_error",
    displayType: "toast",
    httpStatus: 500,
    message: "An error occurred",
    responseType: "error",
    userFriendlyMessage: "An error occurred",
  })),
  shouldShowAsToast: vi.fn<typeof shouldShowAsToast>(() => true),
}));

vi.mock("@/lib/config/upload", () => ({
  getAllowedLabel: vi.fn<(mimes?: readonly string[]) => string>(() => "images, PDFs"),
  UPLOAD_ALLOWED_MIME: ["image/*", "application/pdf"],
  UPLOAD_MAX_LABEL: "10MB",
}));

describe("humaniseUploadError", () => {
  it("returns generic message for non-Error objects", () => {
    expect(humaniseUploadError("string error")).toBe("Error uploading file");
    expect(humaniseUploadError(null)).toBe("Error uploading file");
    expect(humaniseUploadError(undefined)).toBe("Error uploading file");
    expect(humaniseUploadError({ message: "test" })).toBe("Error uploading file");
  });

  it("handles ERR_UNSUPPORTED_MODEL error", () => {
    const error = new Error("ERR_UNSUPPORTED_MODEL: vision not supported");

    expect(humaniseUploadError(error)).toBe(
      "File uploads are not supported for the selected model.",
    );
  });

  it("handles ERR_BAD_MIME error", () => {
    const error = new Error("ERR_BAD_MIME: file type not allowed");

    expect(humaniseUploadError(error)).toBe("File not supported. Allowed: images, PDFs");
  });

  it("handles ERR_FILE_TOO_LARGE error", () => {
    const error = new Error("ERR_FILE_TOO_LARGE: file exceeds limit");

    expect(humaniseUploadError(error)).toBe("File too large. Max 10MB per file");
  });

  it("returns generic message for unknown Error types", () => {
    const error = new Error("Unknown error happened");

    expect(humaniseUploadError(error)).toBe("Error uploading file");
  });
});

describe("processBranchError", () => {
  it("handles branch from non-assistant message error", () => {
    const error = new Error("Can only branch from assistant messages");

    expect(processBranchError(error)).toBe("You can only branch from assistant messages");
  });

  it("handles not found error", () => {
    const error = new Error("Message not found in the database");

    expect(processBranchError(error)).toBe("Message not found or chat unavailable");
  });

  it("handles unauthorized error", () => {
    const error = new Error("unauthorized access to chat");

    expect(processBranchError(error)).toBe("You don't have permission to branch this chat");
  });

  it("handles unknown errors", () => {
    const error = new Error("Something went wrong");

    expect(processBranchError(error)).toBe("Failed to branch chat");
  });

  it("handles non-Error objects", () => {
    expect(processBranchError("string error")).toBe("Failed to branch chat");
    expect(processBranchError({ message: "test" })).toBe("Failed to branch chat");
  });

  it("handles string containing not found", () => {
    expect(processBranchError("Chat not found")).toBe("Message not found or chat unavailable");
  });
});

describe("createChatErrorHandler", () => {
  it("returns a function", () => {
    const handler = createChatErrorHandler();

    expect(typeof handler).toBe("function");
  });

  it("handler accepts an Error parameter", () => {
    const handler = createChatErrorHandler();
    const error = new Error("test error");

    // Should not throw
    expect(() => handler(error)).not.toThrow();
  });
});
