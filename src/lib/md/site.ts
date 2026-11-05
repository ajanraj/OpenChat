import {
  APP_DESCRIPTION,
  APP_NAME,
  SUPPORT_EMAIL,
} from "@/lib/config/constants";

import { absoluteUrl } from "./format";
import { listMarkdownRoutes } from "./registry";

// Crawler policy shared by robots.txt and ai.txt (and summarised in llms.txt).
// Change it here; the three files are generated and never edited by hand.

/** Signed-in, OAuth and user-generated paths that no crawler may read. */
export const PRIVATE_PATHS = [
  "/api/",
  "/auth/callback",
  "/auth/error",
  "/c/",
  "/share/",
  "/tasks",
  "/settings",
] as const;

/** Answer-engine search and user-requested fetchers: they decide whether OS Chat gets cited. */
const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];
const BLOCKED_CRAWLERS = ["Bytespider"];

/** Bump when the ai.txt policy text changes. */
const POLICY_UPDATED = "2026-10-25";

/** Comment carried by robots.txt, llms.txt and ai.txt. */
export const SYNC_NOTE =
  "robots.txt, llms.txt and ai.txt are generated together from src/lib/md; change them there to keep them in sync.";

const robotsGroup = (
  comment: string,
  agents: readonly string[],
  rules: readonly string[]
): string =>
  [
    `# ${comment}`,
    ...agents.map((agent) => `User-agent: ${agent}`),
    ...rules,
  ].join("\n");

export const robotsTxt = (): string => {
  const publicRules = [
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    "Allow: /",
  ];
  return `${[
    [
      `# robots.txt for ${APP_NAME}`,
      `# AI agents: ${absoluteUrl("/llms.txt")} maps the site, ${absoluteUrl("/ai.txt")} states how content may be used.`,
      `# ${SYNC_NOTE}`,
    ].join("\n"),
    robotsGroup("Everyone", ["*"], publicRules),
    robotsGroup(
      "AI search and user-requested fetches (answer-engine citations)",
      AI_SEARCH_CRAWLERS,
      publicRules
    ),
    robotsGroup(
      "AI training crawlers: allowed",
      AI_TRAINING_CRAWLERS,
      publicRules
    ),
    robotsGroup("AI training crawlers: blocked", BLOCKED_CRAWLERS, [
      "Disallow: /",
    ]),
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
  ].join("\n\n")}\n`;
};

const bullets = (items: readonly string[]): string =>
  items.map((item) => `- ${item}`).join("\n");

/** AI usage policy, ai-visibility.org.uk ai.txt spec v1.1.1. */
export const aiTxt = (): string =>
  `${[
    [
      "# Spec: https://www.ai-visibility.org.uk/specifications/ai-txt/ (v1.1.1)",
      `# ${SYNC_NOTE}`,
      "",
      `# AI Usage Policy for ${APP_NAME}`,
    ].join("\n"),
    [
      "Lang: en-US",
      `Website: ${absoluteUrl("/")}`,
      `Last Updated: ${POLICY_UPDATED}`,
    ].join("\n"),
    APP_DESCRIPTION,
    `## Permissions\nAI systems MAY:\n${bullets([
      `Summarise public ${APP_NAME} pages`,
      "Quote public pages with attribution",
      `Cite ${APP_NAME} in answers, linking the canonical page`,
      "Index public pages for search and answer engines",
    ])}`,
    `## Restrictions\nAI systems MUST NOT:\n${bullets([
      `Fabricate quotes, features, prices or policies attributed to ${APP_NAME}`,
      `Generate fake reviews or ratings of ${APP_NAME}`,
      `Present ${APP_NAME} content as their own original work`,
      "Access, train on or reproduce private user data: chats, shared conversations, uploaded files, settings or connected accounts",
    ])}`,
    `## Attribution Requirements\n${bullets([
      `Name the source as "${APP_NAME}" and link the canonical HTML URL, not the .md alternate`,
    ])}`,
    `## AI Training\n${bullets([
      `Public pages may be used for training by: ${AI_TRAINING_CRAWLERS.join(", ")}`,
      `Blocked from all content: ${BLOCKED_CRAWLERS.join(", ")}`,
      "Private and user-generated content may never be used for training",
    ])}`,
    `## Scope Limitations\nIncluded:\n${bullets(
      listMarkdownRoutes().map((route) => route.path)
    )}\n\nExcluded:\n${bullets(PRIVATE_PATHS)}`,
    `## Contact\nEmail: ${SUPPORT_EMAIL}\nWebsite: ${absoluteUrl("/")}`,
    `## Related Files\n${bullets([
      `${absoluteUrl("/llms.txt")}: site map for language models`,
      `${absoluteUrl("/llms-full.txt")}: every page in one file`,
      `${absoluteUrl("/robots.txt")}: crawler access rules`,
    ])}`,
  ].join("\n\n")}\n`;
