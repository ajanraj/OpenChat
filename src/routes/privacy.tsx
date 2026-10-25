import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/legal/legal-page";
import body from "@/content/legal/privacy.md?raw";
import { getMarkdownPage, markdownHead } from "@/lib/md/registry";

const PrivacyPage = () => (
  <LegalPage body={body} title={getMarkdownPage("/privacy").title} />
);

export const Route = createFileRoute("/privacy")({
  ssr: true,
  head: () => markdownHead("/privacy"),
  component: PrivacyPage,
});
