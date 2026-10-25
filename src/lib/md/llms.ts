import { plans } from "@/lib/billingsdk-config";
import {
  APP_DESCRIPTION,
  APP_NAME,
  GITHUB_REPO_URL,
  SUPPORT_EMAIL,
} from "@/lib/config/constants";

import { absoluteUrl, mdLink } from "./format";
import { listMarkdownRoutes, renderMarkdownPage } from "./registry";
import type { MarkdownRoute, MarkdownSection } from "./registry";
import { SYNC_NOTE } from "./site";

// Agents fetch llms-full.txt in one go; past this size it stops fitting most context windows.
const LLMS_FULL_WARN_CHARS = 500_000;

/** llms-full.txt order. */
const SECTION_ORDER: MarkdownSection[] = ["core", "legal"];

const routesIn = (section: MarkdownSection): MarkdownRoute[] =>
  listMarkdownRoutes().filter((route) => route.section === section);

const routeList = (routes: MarkdownRoute[]): string =>
  routes
    .map(
      (route) => `- ${mdLink(route.title, route.markdownUrl)}: ${route.summary}`
    )
    .join("\n");

const keyFacts = (): string => {
  const pricing = plans
    .map((plan) => `${plan.title} $${plan.monthlyPrice}/month`)
    .join(", ");
  return `${APP_NAME} is open source (${GITHUB_REPO_URL}) and can be self-hosted. Plans: ${pricing}. Contact: ${SUPPORT_EMAIL}.`;
};

/** /llms.txt per llmstxt.org: links point at the markdown versions. */
export const llmsTxt = (): string =>
  `${[
    `# ${APP_NAME}`,
    `> ${APP_DESCRIPTION}`,
    keyFacts(),
    `## Core pages\n\n${routeList(routesIn("core"))}`,
    `## Machine-readable\n\n${[
      `- ${mdLink("Full content", absoluteUrl("/llms-full.txt"))}: every page listed here, in one file`,
      `- ${mdLink("Markdown catalog", absoluteUrl("/api/md/_catalog"))}: every markdown route as JSON`,
      `- ${mdLink("Sitemap", absoluteUrl("/sitemap.xml"))}: HTML pages for search engines`,
      `- ${mdLink("AI usage policy", absoluteUrl("/ai.txt"))}: permissions, restrictions and attribution`,
    ].join("\n")}`,
    `## Optional\n\n${routeList(routesIn("legal"))}`,
    `<!-- ${SYNC_NOTE} -->`,
  ].join("\n\n")}\n`;

/** /llms-full.txt: every llms.txt page rendered by the same registry, joined. */
export const llmsFullTxt = async (): Promise<string> => {
  const routes = SECTION_ORDER.flatMap(routesIn);
  const pages = await Promise.all(
    routes.map(async (route) => {
      const { markdown } = await renderMarkdownPage(route.path);
      return `---\n<!-- source: ${route.url} -->\n${markdown}`;
    })
  );
  const generated = new Date().toISOString().slice(0, 10);
  const full = `# ${APP_NAME} - full content\n\n> ${APP_DESCRIPTION}\n\nGenerated: ${generated}\n\n${pages.join("\n")}`;
  if (full.length > LLMS_FULL_WARN_CHARS) {
    console.warn(
      `llms-full.txt is ${full.length} chars (limit ${LLMS_FULL_WARN_CHARS}); list fewer pages or cap large sections.`
    );
  }
  return full;
};
