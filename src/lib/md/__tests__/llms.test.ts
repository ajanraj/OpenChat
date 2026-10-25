import { describe, expect, it } from "vitest";

import { APP_BASE_URL } from "@/lib/config/constants";

import { llmsFullTxt, llmsTxt } from "../llms";

describe(llmsTxt, () => {
  const llms = llmsTxt();

  it("opens with the site name and description", () => {
    expect(llms).toMatch(/^# OS Chat\n\n> OS Chat is a free, open-source/u);
  });

  it("links every page to its markdown version, legal pages under Optional", () => {
    const [main = "", optional = ""] = llms.split("## Optional");

    expect(main).toContain(`- [OS Chat](${APP_BASE_URL}/index.md): `);
    expect(optional).toContain(
      `- [Privacy Policy](${APP_BASE_URL}/privacy.md): `
    );
    expect(optional).toContain(
      `- [Terms of Service](${APP_BASE_URL}/terms.md): `
    );
    expect(optional).toContain(
      `- [Security Policy](${APP_BASE_URL}/security.md): `
    );
  });

  it("lists the machine-readable files", () => {
    for (const path of [
      "/llms-full.txt",
      "/api/md/_catalog",
      "/sitemap.xml",
      "/ai.txt",
    ]) {
      expect(llms).toContain(`](${APP_BASE_URL}${path})`);
    }
  });
});

describe(llmsFullTxt, () => {
  it("concatenates every page, core before legal, each with its source", async () => {
    const full = await llmsFullTxt();
    const sources = [
      ...full.matchAll(/<!-- source: (?<url>\S+) -->\n# /gu),
    ].map((match) => match.groups?.url);

    expect(full).toMatch(/^# OS Chat - full content\n/u);
    expect(sources).toStrictEqual([
      `${APP_BASE_URL}/`,
      `${APP_BASE_URL}/privacy`,
      `${APP_BASE_URL}/terms`,
      `${APP_BASE_URL}/security`,
    ]);
    expect(full).toContain("### 14. Contact Us");
  });
});
