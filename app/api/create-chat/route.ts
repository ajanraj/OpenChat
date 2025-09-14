import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { PostHog } from "posthog-node";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { createErrorResponse } from "@/lib/error-utils";

export async function POST(request: Request) {
  try {
    // --- Validate request body ---
    const body = await request.json();

    const schema = z.object({
      title: z.string().min(1, "Title is required"),
      model: z.string().min(1, "Model is required"),
      personaId: z.string().optional(),
      timezone: z.string().optional(),
    });

    const parseResult = schema.safeParse(body);

    if (!parseResult.success) {
      return createErrorResponse(new Error("Invalid request body"));
    }

    const { title, model, personaId } = parseResult.data;

    const token = await convexAuthNextjsToken();

    const user = await fetchQuery(api.users.getCurrentUser, {}, { token });

    // If the user is not authenticated or the token is invalid, short-circuit early
    if (!user) {
      return createErrorResponse(new Error("Unauthorized"));
    }

    // Check usage limits before creating the chat. This mutation will throw
    // an error if the user is over their limit, which will be caught below.
    await fetchMutation(api.users.assertNotOverLimit, {}, { token });

    // Create the new chat record in Convex
    const { chatId } = await fetchMutation(
      api.chats.createChat,
      {
        title,
        model,
        personaId,
      },
      { token }
    );

    // Only track if PostHog is configured
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      try {
        const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY);
        posthog.capture({
          distinctId: user._id,
          event: "chat_created",
          properties: {
            model,
          },
        });
        posthog.shutdown().catch((_error) => {
          // console.error('PostHog shutdown failed:', _error);
          // PostHog shutdown failures are non-critical for user experience
        });
      } catch (_error) {
        // console.error('PostHog tracking failed:', error);
        // Don't let tracking failures affect the API response
      }
    }

    // The client now only needs the ID to redirect to the new chat page.
    // The chat data itself will be fetched on the client via a query.
    return new Response(JSON.stringify({ chatId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    // console.error('Error in create-chat endpoint:', err);
    return createErrorResponse(err);
  }
}
