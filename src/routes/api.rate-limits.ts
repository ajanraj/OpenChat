import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/convex/_generated/api";
import { createErrorResponse } from "@/lib/error-utils";
import { authMiddleware, json, unauthorized } from "@/lib/middleware/auth";
import { resolveRateLimitStatus } from "@/lib/rate-limit-status";

export const Route = createFileRoute("/api/rate-limits")({
  server: {
    middleware: [authMiddleware],
    handlers: {
      GET: async ({ context }) => {
        try {
          const { client } = context;
          const rateLimitState = await client.query(api.users.getRateLimitStatus, {});
          if (!rateLimitState) {
            return unauthorized();
          }

          return json(resolveRateLimitStatus(rateLimitState, Date.now()));
        } catch (err: unknown) {
          return createErrorResponse(err);
        }
      },
    },
  },
});
