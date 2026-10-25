import { createFileRoute } from "@tanstack/react-router";

import { siteFileHandlers } from "@/lib/md/http";
import { robotsTxt } from "@/lib/md/site";

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: siteFileHandlers(robotsTxt) },
});
