import { createFileRoute } from "@tanstack/react-router";

import { siteFileHandlers } from "@/lib/md/http";
import { aiTxt } from "@/lib/md/site";

export const Route = createFileRoute("/ai.txt")({
  server: { handlers: siteFileHandlers(aiTxt) },
});
