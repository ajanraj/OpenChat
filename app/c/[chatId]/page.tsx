import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import Chat from "../../components/chat/chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  // Validate the chat on the server to avoid client-side flashes.
  const token = await convexAuthNextjsToken();

  // If we fail to obtain a token (anonymous visitor with cookies disabled, etc.)
  // we still attempt the query – Convex will treat it as anonymous and only
  // return chats owned by an anonymous session.

  // `params` is asynchronous in Next.js 15.
  const { chatId } = await params;

  if (!chatId) {
    // If no chatId is provided, redirect to the home page.
    redirect("/");
  }

  try {
    const chat = await fetchQuery(
      api.chats.getChat,
      { chatId: chatId as Id<"chats"> },
      { token }
    );

    if (!chat) {
      // Chat either does not exist or is not owned by the user.
      redirect("/");
    }

    // Render the regular chat shell. The Chat component is a client component
    // and will fetch its messages as usual.
    return <Chat />;
  } catch (_error) {
    // Handle ArgumentValidationError or any other errors gracefully
    redirect("/");
  }
}
