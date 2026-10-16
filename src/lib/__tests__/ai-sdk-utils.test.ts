import { describe, expect, it } from "vitest";
import { convertAttachmentsToFileParts, createPartsFromAIResponse, extractAttachmentsFromParts, extractReasoningFromParts, extractReasoningFromResponse, isConvexStorageId } from '../ai-sdk-utils';
import type { Attachment } from '../ai-sdk-utils';

describe("isConvexStorageId", () => {
  it("returns true for valid 32-character lowercase alphanumeric string", () => {
    expect(isConvexStorageId("abc123def456ghi789jkl012mno345pq")).toBe(true);
  });

  it("returns false for strings starting with http", () => {
    expect(isConvexStorageId("https://example.com/file.png")).toBe(false);
    expect(isConvexStorageId("http://example.com/file.png")).toBe(false);
  });

  it("returns false for data URLs", () => {
    expect(isConvexStorageId("data:image/png;base64,abc123")).toBe(false);
  });

  it("returns false for blob URLs", () => {
    expect(isConvexStorageId("blob:https://example.com/uuid")).toBe(false);
  });

  it("returns false for strings that are too short", () => {
    expect(isConvexStorageId("abc123")).toBe(false);
  });

  it("returns false for strings that are too long", () => {
    expect(isConvexStorageId("abc123def456ghi789jkl012mno345pqrstuvwxyz")).toBe(false);
  });

  it("returns false for strings with uppercase letters", () => {
    expect(isConvexStorageId("ABC123DEF456GHI789JKL012MNO345PQ")).toBe(false);
  });

  it("returns false for strings with special characters", () => {
    expect(isConvexStorageId("abc123-def456-ghi789-jkl012-mno")).toBe(false);
  });
});

describe("extractAttachmentsFromParts", () => {
  it("returns undefined for undefined parts", () => {
    expect(extractAttachmentsFromParts(undefined)).toBeUndefined();
  });

  it("returns undefined for empty parts array", () => {
    expect(extractAttachmentsFromParts([])).toBeUndefined();
  });

  it("returns undefined when no file parts exist", () => {
    const parts = [{ type: "text" as const, text: "Hello" }];

    expect(extractAttachmentsFromParts(parts)).toBeUndefined();
  });

  it("extracts file parts as attachments", () => {
    const parts = [
      {
        type: "file" as const,
        url: "https://example.com/file.png",
        mediaType: "image/png",
        filename: "file.png",
      },
    ];

    const result = extractAttachmentsFromParts(parts);

    expect(result).toBeDefined();
    expect(result?.length).toBe(1);
    expect(result?.[0].url).toBe("https://example.com/file.png");
    expect(result?.[0].contentType).toBe("image/png");
    expect(result?.[0].name).toBe("file.png");
  });

  it("sets storageId for Convex storage IDs", () => {
    const storageId = "abc123def456ghi789jkl012mno345pq";
    const parts = [
      {
        type: "file" as const,
        url: storageId,
        mediaType: "image/png",
        filename: "file.png",
      },
    ];

    const result = extractAttachmentsFromParts(parts);

    expect(result?.[0].storageId).toBe(storageId);
  });

  it("does not set storageId for regular URLs", () => {
    const parts = [
      {
        type: "file" as const,
        url: "https://example.com/file.png",
        mediaType: "image/png",
        filename: "file.png",
      },
    ];

    const result = extractAttachmentsFromParts(parts);

    expect(result?.[0].storageId).toBeUndefined();
  });
});

describe("convertAttachmentsToFileParts", () => {
  it("converts attachments to file parts", () => {
    const attachments: Attachment[] = [
      {
        name: "test.png",
        contentType: "image/png",
        url: "https://example.com/test.png",
      },
    ];

    const result = convertAttachmentsToFileParts(attachments);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("file");
    expect(result[0].url).toBe("https://example.com/test.png");
    expect(result[0].mediaType).toBe("image/png");
    expect(result[0].filename).toBe("test.png");
  });

  it("uses storageId when available", () => {
    const storageId = "abc123def456ghi789jkl012mno345pq";
    const attachments: Attachment[] = [
      {
        name: "test.png",
        contentType: "image/png",
        url: "https://example.com/test.png",
        storageId,
      },
    ];

    const result = convertAttachmentsToFileParts(attachments);

    expect(result[0].url).toBe(storageId);
  });

  it("uses default content type when not provided", () => {
    const attachments: Attachment[] = [
      {
        name: "test.bin",
        url: "https://example.com/test.bin",
      },
    ];

    const result = convertAttachmentsToFileParts(attachments);

    expect(result[0].mediaType).toBe("application/octet-stream");
  });

  it("handles empty attachments array", () => {
    const result = convertAttachmentsToFileParts([]);

    expect(result).toEqual([]);
  });
});

describe("extractReasoningFromResponse", () => {
  it("returns undefined for empty parts", () => {
    expect(extractReasoningFromResponse([])).toBeUndefined();
  });

  it("returns undefined when no reasoning parts exist", () => {
    const parts = [{ type: "text" as const, text: "Hello" }];

    expect(extractReasoningFromResponse(parts)).toBeUndefined();
  });

  it("extracts reasoning text from reasoning parts", () => {
    const parts = [
      { type: "text" as const, text: "Hello" },
      { type: "reasoning" as const, text: "Let me think about this..." },
    ];

    const result = extractReasoningFromResponse(parts);

    expect(result).toBe("Let me think about this...");
  });

  it("joins multiple reasoning parts with newlines", () => {
    const parts = [
      { type: "reasoning" as const, text: "First thought" },
      { type: "reasoning" as const, text: "Second thought" },
    ];

    const result = extractReasoningFromResponse(parts);

    expect(result).toBe("First thought\nSecond thought");
  });
});

describe("extractReasoningFromParts", () => {
  it("returns undefined for undefined parts", () => {
    expect(extractReasoningFromParts(undefined)).toBeUndefined();
  });

  it("returns undefined for empty parts", () => {
    expect(extractReasoningFromParts([])).toBeUndefined();
  });

  it("returns undefined when no reasoning parts exist", () => {
    const parts = [{ type: "text" as const, text: "Hello" }];

    expect(extractReasoningFromParts(parts)).toBeUndefined();
  });

  it("returns first reasoning part text", () => {
    const parts = [
      { type: "reasoning" as const, text: "First thought" },
      { type: "reasoning" as const, text: "Second thought" },
    ];

    const result = extractReasoningFromParts(parts);

    expect(result).toBe("First thought");
  });
});

describe("createPartsFromAIResponse", () => {
  it("creates parts with text content", () => {
    const result = createPartsFromAIResponse("Hello world");

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect((result[0] as { text: string }).text).toBe("Hello world");
  });

  it("adds reasoning part when provided", () => {
    const result = createPartsFromAIResponse("Hello", "Thinking...");

    expect(result).toHaveLength(2);
    expect(result[1].type).toBe("reasoning");
    expect((result[1] as { text: string }).text).toBe("Thinking...");
  });

  it("adds tool invocation parts", () => {
    const toolInvocations = [
      {
        toolCallId: "call-1",
        toolName: "web_search",
        args: { query: "test" },
        result: { results: [] },
        state: "result" as const,
      },
    ];

    const result = createPartsFromAIResponse("Result", undefined, toolInvocations);

    expect(result).toHaveLength(2);
    expect(result[1].type).toBe("tool-web_search");
  });

  it("handles multiple tool invocations", () => {
    const toolInvocations = [
      {
        toolCallId: "call-1",
        toolName: "search",
        state: "result" as const,
      },
      {
        toolCallId: "call-2",
        toolName: "calculator",
        state: "result" as const,
      },
    ];

    const result = createPartsFromAIResponse("Result", undefined, toolInvocations);

    expect(result).toHaveLength(3);
  });

  it("handles empty tool invocations array", () => {
    const result = createPartsFromAIResponse("Hello", undefined, []);

    expect(result).toHaveLength(1);
  });

  it("handles undefined tool invocations", () => {
    const result = createPartsFromAIResponse("Hello", undefined, undefined);

    expect(result).toHaveLength(1);
  });
});
