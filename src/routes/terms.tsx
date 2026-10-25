import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/legal/legal-page";
import body from "@/content/legal/terms.md?raw";
import { getMarkdownPage, markdownHead } from "@/lib/md/registry";

const TermsPage = () => (
  <LegalPage body={body} title={getMarkdownPage("/terms").title} />
);

export const Route = createFileRoute("/terms")({
  ssr: true,
  head: () => markdownHead("/terms"),
  component: TermsPage,
});
