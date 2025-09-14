import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { disconnectAccount } from "@/lib/composio-server";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
import { createErrorResponse } from "@/lib/error-utils";
import type { ConnectorType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get current user
    const user = await fetchQuery(api.users.getCurrentUser, {}, { token });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let connectorType: ConnectorType;
    try {
      ({ connectorType } = await request.json());
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    if (!SUPPORTED_CONNECTORS.includes(connectorType)) {
      return NextResponse.json(
        { error: "Invalid connector type" },
        { status: 400 }
      );
    }

    // Find the connector to get connection ID
    const connectors = await fetchQuery(
      api.connectors.listUserConnectors,
      {},
      { token }
    );

    const connector = connectors.find((c) => c.type === connectorType);
    if (!connector) {
      return NextResponse.json(
        { error: "Connector not found" },
        { status: 404 }
      );
    }

    // Disconnect from Composio
    await disconnectAccount(connector.connectionId, user._id);

    // Remove from Convex
    await fetchMutation(
      api.connectors.removeConnection,
      {
        type: connectorType as ConnectorType,
      },
      { token }
    );

    return NextResponse.json({
      success: true,
      message: "Connection deleted successfully",
    });
  } catch (error: unknown) {
    // Use the established error handling system which provides:
    // - Proper ConvexError detection and narrowing
    // - Machine-readable error codes (e.g., CONNECTOR_NOT_FOUND)
    // - Consistent error response format with `code` property
    // - Correct HTTP status codes (404 for CONNECTOR_NOT_FOUND)
    return createErrorResponse(error);
  }
}
