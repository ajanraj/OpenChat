import { prefersMarkdown } from "./accept";
import { absoluteUrl } from "./format";
import { isMarkdownPath, renderMarkdownPage } from "./registry";

const MARKDOWN_TYPE = "text/markdown; charset=utf-8";
// Content only changes on deploy (which purges Vercel's CDN), so cache for a day.
const PAGE_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";
const NOT_FOUND_CACHE = "public, s-maxage=300";
// Rough token estimate for X-Markdown-Tokens.
const CHARS_PER_TOKEN = 4;
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Accept",
};
// Prefixes whose .md URLs belong to the app (endpoints, assets), never to page markdown.
const PASSTHROUGH_PREFIXES = ["/api/", "/.well-known/", "/assets/"];

/** Advertises the site-level agent files on every HTML response. */
export const SITE_FILES_LINK = ["/llms.txt", "/llms-full.txt", "/ai.txt"]
  .map((path) => `<${absoluteUrl(path)}>; rel="describedby"`)
  .join(", ");

interface TextResponseInit {
  method: string;
  contentType: string;
  cacheControl: string;
  status?: number;
  headers?: Record<string, string>;
}

/** Public, CORS-open text response; HEAD gets the same headers without a body. */
export const textResponse = (
  body: string,
  { method, contentType, cacheControl, status = 200, headers }: TextResponseInit
): Response => {
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      ...CORS_HEADERS,
      ...headers,
    },
  });
};

/** GET/HEAD/OPTIONS handlers for a generated site file such as /llms.txt. */
export const siteFileHandlers = (
  render: () => string | Promise<string>,
  contentType = "text/plain; charset=utf-8"
) => {
  const handler = async ({ request }: { request: Request }) =>
    textResponse(await render(), {
      method: request.method,
      contentType,
      cacheControl: PAGE_CACHE,
    });
  return { GET: handler, HEAD: handler, OPTIONS: handler };
};

const markdownHeaders = (markdown: string) => ({
  "X-Markdown-Tokens": String(Math.ceil(markdown.length / CHARS_PER_TOKEN)),
  "X-Robots-Tag": "noindex, follow",
});

const notFoundMarkdown = (): string =>
  `# Page not found\n\n> No markdown version exists at this URL.\n\nEvery page with a markdown version is listed at ${absoluteUrl("/llms.txt")}.\n`;

/**
 * Markdown for an app path ("/privacy"), or a markdown 404. Shared by the
 * .md suffix, Accept negotiation and /api/md, so all three answer the same.
 * `negotiated` marks a response chosen by Accept, which must carry Vary.
 */
export const markdownForPath = async (
  path: string,
  method: string,
  { negotiated = false }: { negotiated?: boolean } = {}
): Promise<Response> => {
  if (!isMarkdownPath(path)) {
    const markdown = notFoundMarkdown();
    return textResponse(markdown, {
      method,
      status: 404,
      contentType: MARKDOWN_TYPE,
      cacheControl: NOT_FOUND_CACHE,
      headers: markdownHeaders(markdown),
    });
  }
  const { markdown, lastModified } = await renderMarkdownPage(path);
  const canonical = absoluteUrl(path);
  return textResponse(markdown, {
    method,
    contentType: MARKDOWN_TYPE,
    cacheControl: PAGE_CACHE,
    headers: {
      ...markdownHeaders(markdown),
      "Content-Location": canonical,
      Link: `<${canonical}>; rel="canonical"`,
      ...(lastModified === undefined
        ? {}
        : { "Last-Modified": new Date(lastModified).toUTCString() }),
      ...(negotiated ? { Vary: "Accept" } : {}),
    },
  });
};

/**
 * Entry point for the request middleware: the markdown response for a page's
 * .md URL, or for a page URL whose Accept header prefers markdown. Returns
 * undefined for everything else so the app handles it as usual.
 */
export const resolveMarkdownRequest = async (
  request: Request
): Promise<Response | undefined> => {
  if (!READ_METHODS.has(request.method)) {
    return undefined;
  }
  const { pathname } = new URL(request.url);
  const isPassthrough = PASSTHROUGH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (pathname.endsWith(".md") && !isPassthrough) {
    const path = pathname === "/index.md" ? "/" : pathname.slice(0, -3);
    return await markdownForPath(path, request.method);
  }
  if (
    request.method !== "OPTIONS" &&
    isMarkdownPath(pathname) &&
    prefersMarkdown(request.headers.get("Accept"))
  ) {
    return await markdownForPath(pathname, request.method, {
      negotiated: true,
    });
  }
  return undefined;
};
