import { APP_BASE_URL } from "@/lib/config/constants";

const LINK_TEXT_SPECIAL = /[[\]\\]/gu;

/** Absolute canonical URL for an app path, e.g. "/privacy". */
export const absoluteUrl = (path: string): string =>
  new URL(path, APP_BASE_URL).href;

/** Markdown alternate of an app path: "/" -> "/index.md", "/terms" -> "/terms.md". */
export const markdownPath = (path: string): string =>
  path === "/" ? "/index.md" : `${path}.md`;

/** Inline markdown link with the text escaped. */
export const mdLink = (text: string, url: string): string =>
  `[${text.replaceAll(LINK_TEXT_SPECIAL, "\\$&")}](${url})`;

interface PageMarkdownInput {
  title: string;
  summary: string;
  path: string;
  lastModified?: string;
  body: string;
  related: { title: string; path: string }[];
}

/** The shared page shape: title, summary, canonical, content, related links. */
export const pageMarkdown = ({
  title,
  summary,
  path,
  lastModified,
  body,
  related,
}: PageMarkdownInput): string => {
  const meta = [`Canonical: ${absoluteUrl(path)}`];
  if (lastModified !== undefined) {
    meta.push(`Last updated: ${lastModified}`);
  }
  const relatedList = related
    .map((page) => `- ${mdLink(page.title, absoluteUrl(page.path))}`)
    .join("\n");
  return `# ${title}\n\n> ${summary}\n\n${meta.join("\n")}\n\n${body.trim()}\n\n## Related\n\n${relatedList}\n`;
};
