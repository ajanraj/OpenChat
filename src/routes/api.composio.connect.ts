import { createFileRoute } from "@tanstack/react-router";

import { api } from "@/convex/_generated/api";
import { initiateConnection } from "@/lib/composio-server";
import { isConnectorType } from "@/lib/config/tools";
import { createErrorResponse } from "@/lib/error-utils";
import {
  authMiddleware,
  badRequest,
  json,
  notFound,
} from "@/lib/middleware/auth";

/** The app's own URL when VITE_APP_URL is unset. */
const defaultAppUrl = () =>
  process.env.NODE_ENV === "production"
    ? "https://oschat.ai"
    : "http://localhost:3000";

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
          if (user.isAnonymous === true) {
            return json(
              { error: "Sign in with Google to use connectors" },
              { status: 403 }
            );
          }

          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return badRequest("Invalid JSON in request body");
          }
          // A null body has no fields to read
          if (body === null) {
            return badRequest("Invalid JSON in request body");
          }

          const connectorType =
            typeof body === "object" && "connectorType" in body
              ? body.connectorType
              : undefined;
          if (
            connectorType === undefined ||
            connectorType === null ||
            connectorType === ""
          ) {
            return badRequest("Missing connector type");
          }

          if (
            typeof connectorType !== "string" ||
            !isConnectorType(connectorType)
          ) {
            return badRequest("Invalid connector type");
          }

          // Set callback URL for same-tab flow
          const appUrl = process.env.VITE_APP_URL;
          const baseUrl =
            appUrl !== undefined && appUrl !== "" ? appUrl : defaultAppUrl();
          const callbackUrl = `${baseUrl}/auth/callback?type=${connectorType}`;

          // Initiate connection with Composio
          const { redirectUrl, connectionRequestId } = await initiateConnection(
            user._id,
            connectorType,
            callbackUrl
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
