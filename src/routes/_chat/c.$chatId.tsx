import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/c/$chatId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    // If no chatId is provided, redirect to home
    if (!params.chatId) {
      throw redirect({ to: "/" });
    }
  },
  component: ChatPage,
});

function ChatPage() {
  return null;
}
