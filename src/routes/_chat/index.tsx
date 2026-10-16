import { createFileRoute } from "@tanstack/react-router";

const ChatIndex = () => null;

export const Route = createFileRoute("/_chat/")({
  component: ChatIndex,
});
