import { describe, expect, it } from "vitest";

import { APP_BASE_URL, SUPPORT_EMAIL } from "@/lib/config/constants";

import { aiTxt, PRIVATE_PATHS, robotsTxt } from "../site";

/** robots.txt groups keyed by user agent, as directive lists. */
const robotsGroups = (robots: string): Map<string, string[]> => {
  const groups = new Map<string, string[]>();
  for (const block of robots.split("\n\n")) {
    const lines = block.split("\n").filter((line) => !line.startsWith("#"));
    const agents = lines.filter((line) => line.startsWith("User-agent: "));
    const rules = lines.filter((line) => !line.startsWith("User-agent: "));
    for (const agent of agents) {
      groups.set(agent.slice("User-agent: ".length), rules);
    }
  }
  return groups;
};

describe(robotsTxt, () => {
  const groups = robotsGroups(robotsTxt());

  it("lets AI search and training crawlers read public pages but not private ones", () => {
    for (const agent of [
      "*",
      "OAI-SearchBot",
      "ChatGPT-User",
      "Claude-SearchBot",
      "Claude-User",
      "PerplexityBot",
      "Perplexity-User",
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
    ]) {
      expect(groups.get(agent)).toStrictEqual([
        "Disallow: /api/",
        "Disallow: /auth/callback",
        "Disallow: /auth/error",
        "Disallow: /c/",
        "Disallow: /share/",
        "Disallow: /tasks",
        "Disallow: /settings",
        "Allow: /",
      ]);
    }
  });

  it("blocks Bytespider entirely", () => {
    expect(groups.get("Bytespider")).toStrictEqual(["Disallow: /"]);
  });

  it("points to the sitemap and the agent files", () => {
    const robots = robotsTxt();

    expect(robots).toContain(`Sitemap: ${APP_BASE_URL}/sitemap.xml`);
    expect(robots).toContain(`${APP_BASE_URL}/llms.txt`);
    expect(robots).toContain(`${APP_BASE_URL}/ai.txt`);
  });
});

describe(aiTxt, () => {
  const policy = aiTxt();

  it("follows the ai.txt identity block and required sections", () => {
    expect(policy).toMatch(/^# AI Usage Policy for OS Chat$/mu);
    expect(policy).toContain(`Website: ${APP_BASE_URL}/`);
    expect(policy).toMatch(/^Last Updated: \d{4}-\d{2}-\d{2}$/mu);
    expect(policy).toMatch(/## Permissions\nAI systems MAY:\n- /u);
    expect(policy).toMatch(/## Restrictions\nAI systems MUST NOT:\n- /u);
  });

  it("names the support contact", () => {
    expect(policy).toContain(`Email: ${SUPPORT_EMAIL}`);
  });

  it("excludes the same private paths as robots.txt", () => {
    for (const path of PRIVATE_PATHS) {
      expect(policy).toContain(`- ${path}`);
    }
  });
});
