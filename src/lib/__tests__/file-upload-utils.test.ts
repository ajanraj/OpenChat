import type { FileUIPart } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  createOptimisticAttachments,
  revokeOptimisticAttachments,
} from "../file-upload-utils";

const BLOB_URL_PATTERN = /^blob:/u;

describe(createOptimisticAttachments, () => {
  it("creates FileUIPart array from files", () => {
    const mockFile1 = new File(["content1"], "test1.txt", {
      type: "text/plain",
    });
    const mockFile2 = new File(["content2"], "test2.pdf", {
      type: "application/pdf",
    });

    const result = createOptimisticAttachments([mockFile1, mockFile2]);

    expect(
      result.map(({ type, filename, mediaType }) => ({
        type,
        filename,
        mediaType,
      }))
    ).toStrictEqual([
      { type: "file", filename: "test1.txt", mediaType: "text/plain" },
      { type: "file", filename: "test2.pdf", mediaType: "application/pdf" },
    ]);
    expect(result.map(({ url }) => url)).toStrictEqual([
      expect.stringMatching(BLOB_URL_PATTERN),
      expect.stringMatching(BLOB_URL_PATTERN),
    ]);
  });

  it("returns empty array for empty files array", () => {
    const result = createOptimisticAttachments([]);
    expect(result).toStrictEqual([]);
  });

  it("handles files with empty type", () => {
    const mockFile = new File(["content"], "test.bin", { type: "" });
    const result = createOptimisticAttachments([mockFile]);

    expect(result).toHaveLength(1);
    expect(result[0].mediaType).toBe("");
  });
});

describe(revokeOptimisticAttachments, () => {
  it("revokes blob URLs", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts: FileUIPart[] = [
      {
        type: "file",
        mediaType: "image/png",
        url: "blob:http://localhost/abc123",
      },
      {
        type: "file",
        mediaType: "image/png",
        url: "blob:http://localhost/def456",
      },
    ];

    revokeOptimisticAttachments(parts);

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/abc123"
    );
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/def456"
    );

    revokeObjectURL.mockRestore();
  });

  it("ignores non-blob URLs", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts: FileUIPart[] = [
      {
        type: "file",
        mediaType: "image/png",
        url: "https://example.com/image.png",
      },
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,abc",
      },
    ];

    revokeOptimisticAttachments(parts);

    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeObjectURL.mockRestore();
  });

  it("handles mixed blob and non-blob URLs", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts: FileUIPart[] = [
      {
        type: "file",
        mediaType: "image/png",
        url: "blob:http://localhost/abc123",
      },
      {
        type: "file",
        mediaType: "image/png",
        url: "https://example.com/image.png",
      },
      {
        type: "file",
        mediaType: "image/png",
        url: "blob:http://localhost/def456",
      },
    ];

    revokeOptimisticAttachments(parts);

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);

    revokeObjectURL.mockRestore();
  });

  it("handles empty array", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    revokeOptimisticAttachments([]);

    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeObjectURL.mockRestore();
  });

  it("handles parts with undefined url", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts = [
      { type: "file" as const, url: undefined },
      { type: "file" as const },
    ];

    // Should not throw; called untyped, since FileUIPart requires a url
    Reflect.apply(revokeOptimisticAttachments, undefined, [parts]);

    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeObjectURL.mockRestore();
  });
});
