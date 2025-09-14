import { fetchQuery } from "convex/nextjs";
import { ImageResponse } from "next/og";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Regex for checking if first character is alphabetic
const ALPHABET_REGEX = /[a-zA-Z]/;

// Image metadata
export const alt = "Shared Chat - OS Chat";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Image generation
export default async function Image({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  try {
    const { chatId } = await params;

    // Get chat metadata if public
    let chatTitle = "Chat";
    let createdDate = "";

    try {
      const chat = await fetchQuery(api.chats.getPublicChat, {
        chatId: chatId as Id<"chats">,
      });

      if (chat) {
        const rawTitle = chat.title || "Chat";
        // Capitalize first letter if it's an alphabet character
        chatTitle = rawTitle.charAt(0).match(ALPHABET_REGEX)
          ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)
          : rawTitle;
        const timestamp = chat.createdAt || chat._creationTime;
        createdDate = new Date(timestamp).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    } catch {
      // Use defaults if chat fetch fails
    }

    return new ImageResponse(
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          padding: "80px 60px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* oschat.ai branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              color: "#888888",
              fontSize: "24px",
              fontWeight: "500",
              display: "flex",
            }}
          >
            oschat.ai
          </div>
        </div>

        {/* Chat Title */}
        <div
          style={{
            color: "#ffffff",
            fontSize: "48px",
            fontWeight: "700",
            textAlign: "center",
            lineHeight: "1.2",
            marginBottom: "30px",
            maxWidth: "900px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 20px",
          }}
        >
          {chatTitle}
        </div>

        {/* Date */}
        {createdDate && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: "#666666",
                fontSize: "18px",
                fontWeight: "400",
                display: "flex",
              }}
            >
              {createdDate}
            </div>
          </div>
        )}
      </div>,
      {
        ...size,
      }
    );
  } catch (_error) {
    // Fallback design in case of any errors
    return new ImageResponse(
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              color: "#888888",
              fontSize: "24px",
              fontWeight: "500",
              display: "flex",
            }}
          >
            oschat.ai
          </div>
        </div>
        <div
          style={{
            color: "#ffffff",
            fontSize: "48px",
            fontWeight: "700",
            textAlign: "center",
            lineHeight: "1.2",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          Shared Chat
        </div>
      </div>,
      {
        ...size,
      }
    );
  }
}
