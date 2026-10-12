import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/convex/_generated/api";
import { initiateConnection } from "@/lib/composio-server";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { createErrorResponse } from "@/lib/error-utils";
import { authMiddleware, badRequest, json, notFound } from "@/lib/middleware/auth";
import type { ConnectorType } from "@/lib/types";

export const Route = createFileRoute("/api/composio/connect")({
  server: {
    middleware: [authMiddleware],
    handlers: {
      POST: async ({ context, request }) => {
        try {
          const { client } = context;
          const user = await client.query(api.users.getCurrentUser, {});
          if (!user) {
            return notFound("User not found");
          }
          if (user.isAnonymous) {
            return json({ error: "Sign in with Google to use connectors" }, { status: 403 });
          }

          let connectorType: string;
          try {
            const body = await request.json();
            connectorType = body.connectorType;
          } catch {
            return badRequest("Invalid JSON in request body");
          }

          if (!connectorType) {
            return badRequest("Missing connector type");
          }

          if (!SUPPORTED_CONNECTORS.includes(connectorType as ConnectorType)) {
            return badRequest("Invalid connector type");
          }

          // Set callback URL for same-tab flow
          const baseUrl =
            process.env.VITE_APP_URL ||
            (process.env.NODE_ENV === "production" ? "https://oschat.ai" : "http://localhost:3000");
          const callbackUrl = `${baseUrl}/auth/callback?type=${connectorType}`;

          // Initiate connection with Composio
          const { redirectUrl, connectionRequestId } = await initiateConnection(
            user._id,
            connectorType as ConnectorType,
            callbackUrl,
          );

          return json({
            redirectUrl,
            connectionRequestId,
          });
        } catch (error) {
          return createErrorResponse(error);
        }
      },
    },
  },
});
