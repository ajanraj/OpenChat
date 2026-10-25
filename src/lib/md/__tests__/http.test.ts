import { describe, expect, it } from "vitest";

import { APP_BASE_URL } from "@/lib/config/constants";

import { resolveMarkdownRequest } from "../http";
import { SKIPPED_ROUTES } from "../registry";

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost:3000${path}`, init);

describe(resolveMarkdownRequest, () => {
  it("serves a page's markdown at its .md URL with crawler-safe headers", async () => {
    const response = await resolveMarkdownRequest(request("/privacy.md"));
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toMatch(/^# Privacy Policy\n/u);
    expect(Object.fromEntries(response?.headers ?? [])).toMatchObject({
      "content-type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": String(Math.ceil((body ?? "").length / 4)),
      "x-robots-tag": "noindex, follow",
      "content-location": `${APP_BASE_URL}/privacy`,
      link: `<${APP_BASE_URL}/privacy>; rel="canonical"`,
      "access-control-allow-origin": "*",
      "last-modified": "Tue, 09 Sep 2025 00:00:00 GMT",
    });
    expect(response?.headers.get("cache-control")).toContain("s-maxage=");
    expect(response?.headers.has("vary")).toBeFalsy();
  });

  it("serves the home page at /index.md", async () => {
    const response = await resolveMarkdownRequest(request("/index.md"));

    expect(response?.status).toBe(200);
    await expect(response?.text()).resolves.toMatch(/^# OS Chat\n/u);
  });

  it("answers HEAD with the GET headers and no body", async () => {
    const response = await resolveMarkdownRequest(
      request("/terms.md", { method: "HEAD" })
    );

    expect(response?.status).toBe(200);
    expect(response?.body).toBeNull();
    expect(Number(response?.headers.get("x-markdown-tokens"))).toBeGreaterThan(
      0
    );
  });

  it("answers CORS preflight", async () => {
    const response = await resolveMarkdownRequest(
      request("/terms.md", { method: "OPTIONS" })
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, OPTIONS"
    );
  });

  it.each(["/does-not-exist", ...Object.keys(SKIPPED_ROUTES)])(
    "returns a markdown 404 for %s.md",
    async (path) => {
      const response = await resolveMarkdownRequest(request(`${path}.md`));

      expect(response?.status).toBe(404);
      expect(response?.headers.get("content-type")).toBe(
        "text/markdown; charset=utf-8"
      );
      await expect(response?.text()).resolves.toMatch(/^# Page not found\n/u);
    }
  );

  it("negotiates markdown on a page URL only when the client prefers it", async () => {
    const markdown = await resolveMarkdownRequest(
      request("/security", { headers: { Accept: "text/markdown" } })
    );

    expect(markdown?.status).toBe(200);
    expect(markdown?.headers.get("vary")).toBe("Accept");
    await expect(markdown?.text()).resolves.toMatch(/^# Security Policy\n/u);

    await expect(
      resolveMarkdownRequest(
        request("/security", { headers: { Accept: "*/*" } })
      )
    ).resolves.toBeUndefined();
  });

  it.each([
    ["/settings", { Accept: "text/markdown" }],
    ["/api/chat.md", {}],
    ["/.well-known/skill.md", {}],
    ["/llms.txt", { Accept: "text/markdown" }],
  ])("leaves %s to the app", async (path, headers) => {
    await expect(
      resolveMarkdownRequest(request(path, { headers }))
    ).resolves.toBeUndefined();
  });
});
