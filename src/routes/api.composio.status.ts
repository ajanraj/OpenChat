import { createFileRoute } from "@tanstack/react-router";

import { api } from "@/convex/_generated/api";
import { waitForConnection } from "@/lib/composio-server";
import { createErrorResponse } from "@/lib/error-utils";
import {
  authMiddleware,
  badRequest,
  json,
  notFound,
} from "@/lib/middleware/auth";

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
          if (user.isAnonymous === true) {
            return json(
              { error: "Sign in with Google to use connectors" },
              { status: 403 }
            );
          }

          const { searchParams } = new URL(request.url);
          const connectionRequestId = searchParams.get("connectionRequestId");

          if (connectionRequestId === null || connectionRequestId === "") {
            return badRequest("Connection Request ID is required");
          }

          // Wait for connection to complete (with timeout); only the caller's own requests resolve
          const result = await waitForConnection(
            user._id,
            connectionRequestId,
            // 60 seconds timeout
            60
          );
          if (!result) {
            return notFound("Connection request not found");
          }

          return json(result);
        } catch (error) {
          return createErrorResponse(error);
        }
      },
    },
  },
});
