import { createFileRoute } from "@tanstack/react-router";

import { api } from "@/convex/_generated/api";
import { disconnectAccount } from "@/lib/composio-server";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { createErrorResponse } from "@/lib/error-utils";
import {
  authMiddleware,
  badRequest,
  json,
  notFound,
} from "@/lib/middleware/auth";
import type { ConnectorType } from "@/lib/types";

const isSupportedConnector = (value: unknown): value is ConnectorType =>
  SUPPORTED_CONNECTORS.some((connector) => connector === value);

export const Route = createFileRoute("/api/composio/disconnect")({
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

          const connectorType =
            typeof body === "object" && body !== null && "connectorType" in body
              ? body.connectorType
              : undefined;
          if (!isSupportedConnector(connectorType)) {
            return badRequest("Invalid connector type");
          }

          const connectors = await client.query(
            api.connectors.listUserConnectors,
            {}
          );
          if (!connectors.some((c) => c.type === connectorType)) {
            return notFound("Connector not found");
          }

          // Disconnect from Composio. Accounts are resolved by the caller's Composio user id,
          // never by the stored connectionId, which the client supplied.
          await disconnectAccount(user._id, connectorType);

          // Remove from Convex
          await client.mutation(api.connectors.removeConnection, {
            type: connectorType,
          });

          return json({
            success: true,
            message: "Connection deleted successfully",
          });
        } catch (error: unknown) {
          return createErrorResponse(error);
        }
      },
    },
  },
});
