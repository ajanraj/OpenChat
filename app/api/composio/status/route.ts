import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getToken } from "@/lib/auth-server";
import { waitForConnection } from "@/lib/composio-server";
import { createErrorResponse } from "@/lib/error-utils";

export async function GET(request: Request) {
  try {
    const token = await getToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get current user
    const user = await fetchQuery(api.users.getCurrentUser, {}, { token });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const connectionRequestId = searchParams.get("connectionRequestId");

    if (!connectionRequestId) {
      return NextResponse.json(
        { error: "Connection Request ID is required" },
        { status: 400 }
      );
    }

    try {
      // Wait for connection to complete (with timeout)
      const result = await waitForConnection(
        connectionRequestId,
        60, // 60 seconds timeout
        user._id // Pass userId for cache refresh
      );

      return NextResponse.json(result);
    } catch (error) {
      return createErrorResponse(error);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
