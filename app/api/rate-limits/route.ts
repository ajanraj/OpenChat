import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { createErrorResponse } from "@/lib/error-utils";

export async function GET() {
  try {
    const token = await convexAuthNextjsToken();

    // If no valid token, the user is not authenticated
    if (!token) {
      return createErrorResponse(new Error("Unauthorized"));
    }

    const rateLimitStatus = await fetchQuery(
      api.users.getRateLimitStatus,
      {},
      { token }
    );

    return new Response(JSON.stringify(rateLimitStatus), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    // console.error('Error in /api/rate-limits:', err);
    return createErrorResponse(err);
  }
}
