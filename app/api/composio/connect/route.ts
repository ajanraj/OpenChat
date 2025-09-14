import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { initiateConnection } from "@/lib/composio-server";
import { SUPPORTED_CONNECTORS } from "@/lib/config/tools";
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

    let connectorType: string;
    try {
      const body = await request.json();
      connectorType = body.connectorType;
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    if (!connectorType) {
      return NextResponse.json(
        { error: "Missing connector type" },
        { status: 400 }
      );
    }

    if (!SUPPORTED_CONNECTORS.includes(connectorType as ConnectorType)) {
      return NextResponse.json(
        { error: "Invalid connector type" },
        { status: 400 }
      );
    }

    // Set callback URL for same-tab flow
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://oschat.ai"
        : "http://localhost:3000");
    const callbackUrl = `${baseUrl}/auth/callback?type=${connectorType}`;

    // Initiate connection with Composio
    const { redirectUrl, connectionRequestId } = await initiateConnection(
      user._id,
      connectorType as ConnectorType,
      callbackUrl
    );

    return NextResponse.json({
      redirectUrl,
      connectionRequestId,
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 }
    );
  }
}
