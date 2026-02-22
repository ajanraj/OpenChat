import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ShareView } from "@/components/share/share-view";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const Route = createFileRoute("/share/$chatId")({
  component: ShareChatPage,
  head: ({ params }) => ({
    meta: [
      { title: "Chat - OpenChat" },
      { name: "description", content: "A shared conversation" },
      { property: "og:title", content: "Chat" },
      { property: "og:description", content: "A shared conversation" },
      { property: "og:type", content: "article" },
      {
        property: "og:url",
        content: `${typeof window !== "undefined" ? window.location.origin : ""}/share/${params.chatId}`,
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Chat" },
      { name: "twitter:description", content: "A shared conversation" },
    ],
  }),
});

function ShareChatPage() {
  const { chatId } = Route.useParams();

  // Fetch public chat data
  const chat = useQuery(api.chats.getPublicChat, {
    chatId: chatId as Id<"chats">,
  });

  // Fetch sanitized messages
  const messages = useQuery(api.messages.getPublicChatMessages, {
    chatId: chatId as Id<"chats">,
  });

  // Loading state
  if (chat === undefined || messages === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-20 pb-12 md:pt-24 md:pb-24">
        <div className="flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // Chat not found or not public
  if (chat === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-20 pb-12 md:pt-24 md:pb-24">
        <div className="text-center">
          <h1 className="mb-4 font-medium text-2xl">Chat Not Found</h1>
          <p className="text-muted-foreground">
            This chat may have been deleted or is not publicly available.
          </p>
        </div>
      </div>
    );
  }

  const createdAtMs = chat.createdAt ?? chat._creationTime;
  const createdAtDate = new Date(createdAtMs);
  const createdAtDateTime = createdAtDate.toISOString().split("T")[0];
  const createdAtLabel = createdAtDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pt-20 pb-12 md:pt-24 md:pb-24">
      <div className="mb-8 flex items-center justify-center gap-2 font-medium text-sm">
        <time className="text-foreground" dateTime={createdAtDateTime}>
          {createdAtLabel}
        </time>
      </div>
      <h1 className="mb-4 text-center font-medium text-4xl tracking-tight md:text-5xl">
        {chat.title || "Chat"}
      </h1>
      <p className="mb-8 text-center text-lg text-muted-foreground">
        A conversation from oschat.ai
      </p>
      <ShareView messages={messages ?? []} sourceChatId={chatId} />
    </div>
  );
}
