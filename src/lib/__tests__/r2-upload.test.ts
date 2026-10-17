import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadToR2 } from "../r2-upload";
import type { GenerateUploadUrl } from "../r2-upload";

const reserve = vi.fn<GenerateUploadUrl>().mockResolvedValue({
  key: "obj-key",
  url: "https://r2.example/obj-key?signed",
});

const mockFetch = (status: number) => {
  const fetchMock = vi.fn<typeof fetch>(
    async () => await Promise.resolve(new Response(null, { status }))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe(uploadToR2, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    reserve.mockClear();
  });

  it("declares the blob's type and size, then PUTs it with the same content type", async () => {
    const fetchMock = mockFetch(200);
    const blob = new Blob(["hello"], { type: "image/png" });

    await expect(uploadToR2(blob, reserve)).resolves.toBe("obj-key");

    expect(reserve).toHaveBeenCalledWith({ contentType: "image/png", size: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r2.example/obj-key?signed",
      {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/png" },
      }
    );
  });

  it("throws when R2 rejects the upload", async () => {
    mockFetch(403);
    await expect(
      uploadToR2(new Blob(["x"], { type: "image/png" }), reserve)
    ).rejects.toThrow("status 403");
  });
});
