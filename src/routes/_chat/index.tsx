import { createFileRoute } from "@tanstack/react-router";

import { markdownHead } from "@/lib/md/registry";

const ChatIndex = () => null;

export const Route = createFileRoute("/_chat/")({
  head: () => markdownHead("/"),
  component: ChatIndex,
});
