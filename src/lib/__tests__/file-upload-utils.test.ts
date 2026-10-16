import { describe, expect, it, vi } from "vitest";

import {
  createOptimisticAttachments,
  revokeOptimisticAttachments,
} from "../file-upload-utils";

const BLOB_URL_PATTERN = /^blob:/;

describe("createOptimisticAttachments", () => {
  it("creates FileUIPart array from files", () => {
    const mockFile1 = new File(["content1"], "test1.txt", {
      type: "text/plain",
    });
    const mockFile2 = new File(["content2"], "test2.pdf", {
      type: "application/pdf",
    });

    const result = createOptimisticAttachments([mockFile1, mockFile2]);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("file");
    expect(result[0].filename).toBe("test1.txt");
    expect(result[0].mediaType).toBe("text/plain");
    expect(result[0].url).toMatch(BLOB_URL_PATTERN);

    expect(result[1].type).toBe("file");
    expect(result[1].filename).toBe("test2.pdf");
    expect(result[1].mediaType).toBe("application/pdf");
    expect(result[1].url).toMatch(BLOB_URL_PATTERN);
  });

  it("returns empty array for empty files array", () => {
    const result = createOptimisticAttachments([]);
    expect(result).toEqual([]);
  });

  it("handles files with empty type", () => {
    const mockFile = new File(["content"], "test.bin", { type: "" });
    const result = createOptimisticAttachments([mockFile]);

    expect(result).toHaveLength(1);
    expect(result[0].mediaType).toBe("");
  });
});

describe("revokeOptimisticAttachments", () => {
  it("revokes blob URLs", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts = [
      { type: "file" as const, url: "blob:http://localhost/abc123" },
      { type: "file" as const, url: "blob:http://localhost/def456" },
    ];

    revokeOptimisticAttachments(parts as never);

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

    const parts = [
      { type: "file" as const, url: "https://example.com/image.png" },
      { type: "file" as const, url: "data:image/png;base64,abc" },
    ];

    revokeOptimisticAttachments(parts as never);

    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeObjectURL.mockRestore();
  });

  it("handles mixed blob and non-blob URLs", () => {
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    const parts = [
      { type: "file" as const, url: "blob:http://localhost/abc123" },
      { type: "file" as const, url: "https://example.com/image.png" },
      { type: "file" as const, url: "blob:http://localhost/def456" },
    ];

    revokeOptimisticAttachments(parts as never);

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

    // Should not throw
    revokeOptimisticAttachments(parts as never);

    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeObjectURL.mockRestore();
  });
});
