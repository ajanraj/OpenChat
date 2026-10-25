import { createFileRoute } from "@tanstack/react-router";

import { siteFileHandlers } from "@/lib/md/http";
import { llmsTxt } from "@/lib/md/llms";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: siteFileHandlers(llmsTxt) },
});
