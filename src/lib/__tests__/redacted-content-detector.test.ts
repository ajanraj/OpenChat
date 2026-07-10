import { describe, expect, it } from "vitest";
import {
  detectRedactedContent,
  detectRedactedInParts,
  shouldDisableFork,
} from "../redacted-content-detector";

describe("detectRedactedInParts", () => {
  it("returns zeros for empty array", () => {
    expect(detectRedactedInParts([])).toEqual({
      redactedFiles: 0,
      redactedTools: 0,
      redactedParts: 0,
    });
  });

  it("returns zeros for non-array input", () => {
    expect(detectRedactedInParts(null as unknown as unknown[])).toEqual({
      redactedFiles: 0,
      redactedTools: 0,
      redactedParts: 0,
    });
  });

  it("detects redacted files", () => {
    const parts = [
      { type: "file", url: "redacted" },
      { type: "file", url: "https://example.com/image.png" },
      { type: "file", url: "redacted" },
    ];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 2,
      redactedTools: 0,
      redactedParts: 0,
    });
  });

  it("detects redacted reasoning files", () => {
    const parts = [{ type: "reasoning-file", url: "redacted" }];

    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 1,
      redactedTools: 0,
      redactedParts: 0,
    });
  });

  it("detects redacted tool calls with REDACTED input", () => {
    const parts = [{ type: "tool-call", input: "REDACTED", output: "some output" }];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 0,
      redactedTools: 1,
      redactedParts: 0,
    });
  });

  it("detects redacted tool calls with REDACTED output", () => {
    const parts = [{ type: "tool-result", input: "some input", output: "REDACTED" }];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 0,
      redactedTools: 1,
      redactedParts: 0,
    });
  });

  it("detects redacted tool calls with REDACTED error", () => {
    const parts = [{ type: "tool-error", error: "REDACTED" }];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 0,
      redactedTools: 1,
      redactedParts: 0,
    });
  });

  it("detects redacted message parts", () => {
    const parts = [{ type: "redacted" }, { type: "text", text: "Hello" }];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 0,
      redactedTools: 0,
      redactedParts: 1,
    });
  });

  it("detects all types of redacted content", () => {
    const parts = [
      { type: "file", url: "redacted" },
      { type: "tool-call", input: "REDACTED" },
      { type: "redacted" },
    ];
    expect(detectRedactedInParts(parts)).toEqual({
      redactedFiles: 1,
      redactedTools: 1,
      redactedParts: 1,
    });
  });

  it("skips invalid parts", () => {
    const parts = [null, undefined, "string", 123, { type: "text" }];
    expect(detectRedactedInParts(parts as unknown[])).toEqual({
      redactedFiles: 0,
      redactedTools: 0,
      redactedParts: 0,
    });
  });
});

describe("detectRedactedContent", () => {
  it("returns no redacted content for empty array", () => {
    const result = detectRedactedContent([]);
    expect(result.hasRedactedContent).toBe(false);
    expect(result.description).toBe("Complete content available");
  });

  it("returns no redacted content for non-array input", () => {
    const result = detectRedactedContent(null as unknown as unknown[]);
    expect(result.hasRedactedContent).toBe(false);
    expect(result.description).toBe("No content to check");
  });

  it("detects redacted content across messages", () => {
    const messages = [
      { parts: [{ type: "file", url: "redacted" }] },
      { parts: [{ type: "text", text: "Hello" }] },
      { parts: [{ type: "redacted" }] },
    ];
    const result = detectRedactedContent(messages);
    expect(result.hasRedactedContent).toBe(true);
    expect(result.redactedFiles).toBe(1);
    expect(result.redactedParts).toBe(1);
  });

  it("generates correct description for single type", () => {
    const messages = [{ parts: [{ type: "file", url: "redacted" }] }];
    const result = detectRedactedContent(messages);
    expect(result.description).toBe("Contains private 1 file");
  });

  it("generates correct description for multiple files", () => {
    const messages = [
      {
        parts: [
          { type: "file", url: "redacted" },
          { type: "file", url: "redacted" },
        ],
      },
    ];
    const result = detectRedactedContent(messages);
    expect(result.description).toBe("Contains private 2 files");
  });

  it("generates correct description for two types", () => {
    const messages = [
      {
        parts: [
          { type: "file", url: "redacted" },
          { type: "tool-call", input: "REDACTED" },
        ],
      },
    ];
    const result = detectRedactedContent(messages);
    expect(result.description).toBe("Contains private 1 file and 1 tool call");
  });

  it("generates correct description for three types", () => {
    const messages = [
      {
        parts: [
          { type: "file", url: "redacted" },
          { type: "tool-call", input: "REDACTED" },
          { type: "redacted" },
        ],
      },
    ];
    const result = detectRedactedContent(messages);
    expect(result.description).toBe("Contains private 1 file, 1 tool call, and 1 message part");
  });

  it("skips invalid messages", () => {
    const messages = [null, undefined, "string", { noparts: true }];
    const result = detectRedactedContent(messages as unknown[]);
    expect(result.hasRedactedContent).toBe(false);
  });
});

describe("shouldDisableFork", () => {
  it("returns false for messages without redacted content", () => {
    const messages = [
      { parts: [{ type: "text", text: "Hello" }] },
      { parts: [{ type: "file", url: "https://example.com/image.png" }] },
    ];
    expect(shouldDisableFork(messages)).toBe(false);
  });

  it("returns true for messages with redacted content", () => {
    const messages = [{ parts: [{ type: "file", url: "redacted" }] }];
    expect(shouldDisableFork(messages)).toBe(true);
  });

  it("returns false for empty messages", () => {
    expect(shouldDisableFork([])).toBe(false);
  });
});
