import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Create OpenRouter instance with app attribution headers
export const openrouter = createOpenRouter({
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL || "https://oschat.ai",
    "X-Title": process.env.NEXT_PUBLIC_BASE_TITLE || "oschat.ai",
  },
});
