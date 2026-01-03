import { createFileRoute, Outlet } from "@tanstack/react-router";
import Chat from "@/components/chat/chat";

export const Route = createFileRoute("/_chat")({
  component: ChatLayout,
});

function ChatLayout() {
  return (
    <>
      <Chat />
      <Outlet />
    </>
  );
}
