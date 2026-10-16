import { createFileRoute, redirect } from "@tanstack/react-router";

const ChatPage = () => null;

export const Route = createFileRoute("/_chat/c/$chatId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    // If no chatId is provided, redirect to home (`throw: true` makes redirect throw itself)
    if (!params.chatId) {
      redirect({ to: "/", throw: true });
    }
  },
  component: ChatPage,
});
