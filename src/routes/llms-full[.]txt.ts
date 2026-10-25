import { createFileRoute } from "@tanstack/react-router";

import { siteFileHandlers } from "@/lib/md/http";
import { llmsFullTxt } from "@/lib/md/llms";

export const Route = createFileRoute("/llms-full.txt")({
  server: { handlers: siteFileHandlers(llmsFullTxt) },
});
