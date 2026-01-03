import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  return null;
}
