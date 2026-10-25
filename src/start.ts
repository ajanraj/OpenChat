import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { resolveMarkdownRequest, SITE_FILES_LINK } from "@/lib/md/http";
import { isMarkdownPath } from "@/lib/md/registry";

// Same CSRF guard Start applies by default when no start instance exists.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/** Advertises llms.txt and ai.txt on an HTML response. */
const withAgentHeaders = <T extends { response: Response }>(
  result: T,
  pathname: string
): T => {
  const { headers } = result.response;
  if (headers.get("Content-Type")?.startsWith("text/html") === true) {
    headers.append("Link", SITE_FILES_LINK);
    // The same URL can also answer with markdown, so caches must key on Accept.
    if (isMarkdownPath(pathname)) {
      headers.append("Vary", "Accept");
    }
  }
  return result;
};

/**
 * Serves page markdown for `/<page>.md` and for page URLs requested with
 * `Accept: text/markdown`; every HTML response advertises llms.txt and ai.txt.
 */
const markdownMiddleware = createMiddleware().server(
  async ({ request, pathname, handlerType, next }) => {
    if (handlerType === "serverFn") {
      return await next();
    }
    const markdown = await resolveMarkdownRequest(request);
    if (markdown) {
      return markdown;
    }
    return withAgentHeaders(await next(), pathname);
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, markdownMiddleware],
}));
