import { createFileRoute } from "@tanstack/react-router";

import { markdownForPath, siteFileHandlers } from "@/lib/md/http";
import { listMarkdownRoutes } from "@/lib/md/registry";

const CATALOG = "_catalog";

// Answers GET, HEAD and OPTIONS alike: the response follows request.method.
const { GET: serveCatalog } = siteFileHandlers(
  () => JSON.stringify({ routes: listMarkdownRoutes() }, null, 2),
  "application/json; charset=utf-8"
);

/**
 * Debug-friendly markdown endpoint: /api/md/<path> always answers with
 * markdown (or a markdown 404); /api/md/index is the home page, as with
 * /index.md; /api/md/_catalog lists every markdown route.
 */
const handler = async ({
  request,
  params: { _splat: splat = "" },
}: {
  request: Request;
  params: { _splat?: string };
}) => {
  if (splat === CATALOG) {
    return await serveCatalog({ request });
  }
  const path = splat === "" || splat === "index" ? "/" : `/${splat}`;
  return await markdownForPath(path, request.method);
};

export const Route = createFileRoute("/api/md/$")({
  server: { handlers: { GET: handler, HEAD: handler, OPTIONS: handler } },
});
