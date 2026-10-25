import {
  APP_DESCRIPTION,
  APP_NAME,
  GITHUB_REPO_URL,
} from "@/lib/config/constants";
import type { FileRoutesByFullPath } from "@/routeTree.gen";

import { absoluteUrl, markdownPath, mdLink, pageMarkdown } from "./format";

/** Where a page is listed in llms.txt and in what order it appears in llms-full.txt. */
export type MarkdownSection = "core" | "legal";

interface MarkdownPage {
  title: string;
  /** One or two factual sentences; also the page's ai-summary meta and llms.txt blurb. */
  summary: string;
  section: MarkdownSection;
  /** Main content as markdown, without the title header. Lazy so client bundles skip it. */
  body: () => Promise<string>;
}

// `**Last Updated:** September 9, 2025` line at the top of the legal pages.
const LAST_UPDATED = /^\*\*Last Updated:\*\* (?<date>[^\\\n]+)/mu;

const homeBody = async (): Promise<string> => {
  const { plans } = await import("@/lib/billingsdk-config");
  const planRows = plans.map((plan) => {
    const yearly =
      plan.yearlyPrice === "0" ? "" : ` or $${plan.yearlyPrice}/year`;
    const includes = plan.features.map((feature) => feature.name).join(", ");
    return `| ${plan.title} | $${plan.monthlyPrice}/month${yearly} | ${includes} |`;
  });
  return [
    APP_DESCRIPTION,
    "## Plans",
    ["| Plan | Price | Includes |", "| --- | --- | --- |", ...planRows].join(
      "\n"
    ),
    "## Get started",
    [
      `- ${mdLink("Start a chat", absoluteUrl("/"))}: no account needed to try it`,
      `- ${mdLink("Sign in with Google", absoluteUrl("/auth"))}: raises your daily message limit`,
      `- ${mdLink("Source code on GitHub", GITHUB_REPO_URL)}: ${APP_NAME} is open source and self-hostable`,
    ].join("\n"),
  ].join("\n\n");
};

const rawBody = (load: () => Promise<{ default: string }>) => async () => {
  const module = await load();
  return module.default;
};

/**
 * Every page with a markdown version. Registering a page here is the only
 * step: the .md URL, content negotiation, /api/md, llms.txt, llms-full.txt
 * and the catalog all read from this map.
 */
const MARKDOWN_PAGES = {
  "/": {
    title: APP_NAME,
    summary: `The ${APP_NAME} home page, where you start a chat with any supported AI model. No account is needed to begin; signing in with Google raises the daily message limit.`,
    section: "core",
    body: homeBody,
  },
  "/privacy": {
    title: "Privacy Policy",
    summary: `How ${APP_NAME} collects, uses, shares and protects personal data, which AI providers and third parties process it, and the rights of users under CCPA and GDPR.`,
    section: "legal",
    body: rawBody(async () => await import("@/content/legal/privacy.md?raw")),
  },
  "/terms": {
    title: "Terms of Service",
    summary: `The terms for using ${APP_NAME}: eligibility, accounts, acceptable use, usage limits, ownership of your content, AI limitations, premium services and termination.`,
    section: "legal",
    body: rawBody(async () => await import("@/content/legal/terms.md?raw")),
  },
  "/security": {
    title: "Security Policy",
    summary: `How ${APP_NAME} protects your data: encryption, infrastructure and third-party security, data retention, incident response, and how to report a security issue.`,
    section: "legal",
    body: rawBody(async () => await import("@/content/legal/security.md?raw")),
  },
} as const satisfies Partial<Record<AppPagePath, MarkdownPage>>;

export type MarkdownPath = keyof typeof MARKDOWN_PAGES;

/** App routes that serve pages (API endpoints and generated .txt files excluded). */
type AppPagePath = Exclude<
  keyof FileRoutesByFullPath,
  `/api/${string}` | `${string}.txt`
>;

/**
 * Routes deliberately without a markdown version, with the reason. Typed so
 * that adding a page route breaks typecheck until it is registered above or
 * listed here. Private ones must also be in PRIVATE_PATHS (site.ts) so
 * robots.txt and ai.txt keep crawlers out.
 */
export const SKIPPED_ROUTES: Record<
  Exclude<AppPagePath, MarkdownPath>,
  string
> = {
  "/auth/": "Sign-in button only, no content",
  "/auth/callback": "OAuth redirect handler",
  "/auth/error": "OAuth error screen",
  "/c/$chatId": "Private chat, requires sign-in",
  "/share/$chatId": "User-shared chats are kept out of crawlers (robots.txt)",
  "/settings": "Private account settings",
  "/settings/": "Private account settings",
  "/settings/api-keys": "Private account settings",
  "/settings/attachments": "Private account settings",
  "/settings/connectors": "Private account settings",
  "/settings/contact": "Private account settings",
  "/settings/customization": "Private account settings",
  "/settings/history": "Private account settings",
  "/settings/models": "Private account settings",
  "/tasks": "Private background agents, requires sign-in",
};

export const isMarkdownPath = (path: string): path is MarkdownPath =>
  Object.hasOwn(MARKDOWN_PAGES, path);

export const getMarkdownPage = (path: MarkdownPath): MarkdownPage =>
  MARKDOWN_PAGES[path];

/** Route `head()` for a markdown page: its ai-summary meta and markdown alternate link. */
export const markdownHead = (path: MarkdownPath) => ({
  meta: [{ name: "ai-summary", content: getMarkdownPage(path).summary }],
  links: [
    {
      rel: "alternate",
      type: "text/markdown",
      href: absoluteUrl(markdownPath(path)),
    },
  ],
});

export interface MarkdownRoute {
  path: MarkdownPath;
  title: string;
  summary: string;
  section: MarkdownSection;
  url: string;
  markdownUrl: string;
}

/** Every addressable markdown route, in registry order. */
export const listMarkdownRoutes = (): MarkdownRoute[] =>
  Object.keys(MARKDOWN_PAGES)
    .filter(isMarkdownPath)
    .map((path) => {
      const { title, summary, section } = getMarkdownPage(path);
      return {
        path,
        title,
        summary,
        section,
        url: absoluteUrl(path),
        markdownUrl: absoluteUrl(markdownPath(path)),
      };
    });

export interface RenderedMarkdown {
  markdown: string;
  /** YYYY-MM-DD, when the content states it. */
  lastModified?: string;
}

const parseLastUpdated = (body: string): string | undefined => {
  const date = LAST_UPDATED.exec(body)?.groups?.date;
  return date === undefined
    ? undefined
    : new Date(`${date} UTC`).toISOString().slice(0, 10);
};

export const renderMarkdownPage = async (
  path: MarkdownPath
): Promise<RenderedMarkdown> => {
  const page = getMarkdownPage(path);
  const body = await page.body();
  const lastModified = parseLastUpdated(body);
  const related = listMarkdownRoutes().filter((route) => route.path !== path);
  return {
    markdown: pageMarkdown({ ...page, path, lastModified, body, related }),
    lastModified,
  };
};
