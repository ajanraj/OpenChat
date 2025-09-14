import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { APP_BASE_URL } from "@/lib/config/constants";
import ShareView from "./share-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chatId: string }>;
}): Promise<Metadata> {
  const { chatId } = await params;

  // Get minimal chat metadata if public
  let title = "Chat";
  try {
    const chat = await fetchQuery(api.chats.getPublicChat, {
      chatId: chatId as Id<"chats">,
    });
    if (chat) {
      title = chat.title || "Chat";
    }
  } catch {
    // ignore
  }

  const description = "A shared conversation";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${APP_BASE_URL}/share/${chatId}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ShareChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;

  // Verify chat is public
  const chat = await fetchQuery(api.chats.getPublicChat, {
    chatId: chatId as Id<"chats">,
  });
  if (!chat) {
    redirect("/");
  }

  // Fetch sanitized messages
  const messages = await fetchQuery(api.messages.getPublicChatMessages, {
    chatId: chatId as Id<"chats">,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pt-20 pb-12 md:pt-24 md:pb-24">
      <div className="mb-8 flex items-center justify-center gap-2 font-medium text-sm">
        <time
          className="text-foreground"
          dateTime={
            new Date((chat.createdAt || chat._creationTime) ?? Date.now())
              .toISOString()
              .split("T")[0]
          }
        >
          {new Date(chat.createdAt || chat._creationTime).toLocaleDateString(
            "en-US",
            { year: "numeric", month: "long", day: "numeric" }
          )}
        </time>
      </div>
      <h1 className="mb-4 text-center font-medium text-4xl tracking-tight md:text-5xl">
        {chat.title || "Chat"}
      </h1>
      <p className="mb-8 text-center text-lg text-muted-foreground">
        A conversation from oschat.ai
      </p>
      <ShareView messages={messages} sourceChatId={chatId} />
    </div>
  );
}
