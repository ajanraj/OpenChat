import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/convex/_generated/api";
import { waitForConnection } from "@/lib/composio-server";
import { createErrorResponse } from "@/lib/error-utils";
import { authMiddleware, badRequest, json, notFound } from "@/lib/middleware/auth";

export const Route = createFileRoute("/api/composio/status")({
  server: {
    middleware: [authMiddleware],
    handlers: {
      GET: async ({ context, request }) => {
        try {
          const { client } = context;
          const user = await client.query(api.users.getCurrentUser, {});
          if (!user) {
            return notFound("User not found");
          }

          const { searchParams } = new URL(request.url);
          const connectionRequestId = searchParams.get("connectionRequestId");

          if (!connectionRequestId) {
            return badRequest("Connection Request ID is required");
          }

          try {
            // Wait for connection to complete (with timeout)
            const result = await waitForConnection(
              connectionRequestId,
              60, // 60 seconds timeout
            );

            return json(result);
          } catch (error) {
            return createErrorResponse(error);
          }
        } catch (error) {
          return createErrorResponse(error);
        }
      },
    },
  },
});
