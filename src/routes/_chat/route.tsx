import { createFileRoute, Outlet } from "@tanstack/react-router";

import Chat from "@/components/chat/chat";

const ChatLayout = () => (
  <>
    <Chat />
    <Outlet />
  </>
);

export const Route = createFileRoute("/_chat")({
  component: ChatLayout,
});
