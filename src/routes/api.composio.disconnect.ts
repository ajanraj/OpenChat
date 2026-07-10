import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/convex/_generated/api";
import { disconnectAccount } from "@/lib/composio-server";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { createErrorResponse } from "@/lib/error-utils";
import { authMiddleware, badRequest, json, notFound } from "@/lib/middleware/auth";
import type { ConnectorType } from "@/lib/types";

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

          let connectorType: ConnectorType;
          try {
            const body = await request.json();
            connectorType = body.connectorType;
          } catch {
            return badRequest("Invalid JSON in request body");
          }

          if (!SUPPORTED_CONNECTORS.includes(connectorType)) {
            return badRequest("Invalid connector type");
          }

          // Find the connector to get connection ID
          const connectors = await client.query(api.connectors.listUserConnectors, {});

          const connector = connectors.find(
            (c: { type: string; connectionId: string }) => c.type === connectorType,
          );
          if (!connector) {
            return notFound("Connector not found");
          }

          // Disconnect from Composio
          await disconnectAccount(connector.connectionId);

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
