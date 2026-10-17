import { createFileRoute } from "@tanstack/react-router";
import { PostHog } from "posthog-node";
import { z } from "zod";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createErrorResponse } from "@/lib/error-utils";
import {
  authMiddleware,
  badRequest,
  json,
  unauthorized,
} from "@/lib/middleware/auth";

const createChatSchema = z.object({
  title: z.string().min(1, "Title is required"),
  model: z.string().min(1, "Model is required"),
  personaId: z.string().optional(),
  profileId: z
    .string()
    .refine(
      (value): value is Id<"profiles"> => /^\S+$/u.test(value),
      "profileId must be a non-empty string without whitespace"
    )
    .optional(),
  timezone: z.string().optional(),
});

// Flushes queued PostHog events; failures are non-critical for user experience
const shutdownPostHog = async (posthog: PostHog): Promise<void> => {
  try {
    await posthog.shutdown();
  } catch {
    // Ignore shutdown failures
  }
};

export const Route = createFileRoute("/api/create-chat")({
  server: {
    middleware: [authMiddleware],
    handlers: {
      POST: async ({ context, request }) => {
        try {
          // --- Validate request body ---
          const body: unknown = await request.json();
          const parseResult = createChatSchema.safeParse(body);

          if (!parseResult.success) {
            return badRequest("Invalid request body");
          }

          const { title, model, personaId, profileId } = parseResult.data;

          const { client } = context;
          const user = await client.query(api.users.getCurrentUser, {});

          // If the user is not authenticated or the token is invalid, short-circuit early
          if (!user) {
            return unauthorized();
          }

          // Check usage limits before creating the chat. This mutation will throw
          // an error if the user is over their limit, which will be caught below.
          await client.mutation(api.users.assertNotOverLimit, {});

          // Create the new chat record in Convex
          const { chatId } = await client.mutation(api.chats.createChat, {
            title,
            model,
            personaId,
            profileId,
          });

          // Only track if PostHog is configured
          const posthogKey = process.env.VITE_POSTHOG_KEY;
          if (posthogKey !== undefined && posthogKey !== "") {
            try {
              const posthog = new PostHog(posthogKey);
              posthog.capture({
                distinctId: user._id,
                event: "chat_created",
                properties: {
                  model,
                },
              });
              void shutdownPostHog(posthog);
            } catch {
              // Don't let tracking failures affect the API response
            }
          }

          // The client now only needs the ID to redirect to the new chat page.
          // The chat data itself will be fetched on the client via a query.
          return json({ chatId });
        } catch (error: unknown) {
          return createErrorResponse(error);
        }
      },
    },
  },
});
