import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/legal/legal-page";
import body from "@/content/legal/security.md?raw";
import { getMarkdownPage, markdownHead } from "@/lib/md/registry";

const SecurityPage = () => (
  <LegalPage body={body} title={getMarkdownPage("/security").title} />
);

export const Route = createFileRoute("/security")({
  ssr: true,
  head: () => markdownHead("/security"),
  component: SecurityPage,
});
