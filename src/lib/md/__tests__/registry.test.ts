import { describe, expect, it } from "vitest";

import { APP_BASE_URL } from "@/lib/config/constants";

import { listMarkdownRoutes, renderMarkdownPage } from "../registry";

const MARKDOWN_LINK = /\]\((?<url>[^)]+)\)/gu;

describe(renderMarkdownPage, () => {
  it("renders a legal page with its header, content and last update", async () => {
    const page = await renderMarkdownPage("/privacy");

    expect(page.markdown).toMatch(/^# Privacy Policy\n\n> \S/u);
    expect(page.markdown).toContain(`Canonical: ${APP_BASE_URL}/privacy`);
    expect(page.markdown).toContain("Last updated: 2025-09-09");
    expect(page.markdown).toContain("### 14. Contact Us");
    expect(page.lastModified).toBe("2025-09-09");
  });

  it("renders the home page from the published plan data", async () => {
    const page = await renderMarkdownPage("/");

    expect(page.markdown).toMatch(/^# OS Chat\n/u);
    expect(page.markdown).toContain("| Premium | $10/month or $120/year |");
    expect(page.markdown).not.toContain("Last updated:");
    expect(page.lastModified).toBeUndefined();
  });

  it("links only to absolute HTML URLs", async () => {
    const page = await renderMarkdownPage("/terms");
    const links = [...page.markdown.matchAll(MARKDOWN_LINK)].map(
      (match) => match.groups?.url
    );

    expect(links.length).toBeGreaterThan(0);
    for (const url of links) {
      expect(url).toMatch(/^(?:https?:|mailto:)/u);
      expect(url).not.toMatch(/\.md$/u);
    }
    expect(page.markdown).toContain(
      `- [Privacy Policy](${APP_BASE_URL}/privacy)`
    );
  });
});

describe(listMarkdownRoutes, () => {
  it("lists every markdown page with its HTML and markdown URLs", () => {
    expect(
      listMarkdownRoutes().map(({ url, markdownUrl }) => [url, markdownUrl])
    ).toStrictEqual([
      [`${APP_BASE_URL}/`, `${APP_BASE_URL}/index.md`],
      [`${APP_BASE_URL}/privacy`, `${APP_BASE_URL}/privacy.md`],
      [`${APP_BASE_URL}/terms`, `${APP_BASE_URL}/terms.md`],
      [`${APP_BASE_URL}/security`, `${APP_BASE_URL}/security.md`],
    ]);
  });
});
