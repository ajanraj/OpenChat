/**
 * Authentication middleware and response helpers for TanStack Start server routes.
 */

import { createMiddleware } from "@tanstack/react-start";
import { ConvexHttpClient } from "convex/browser";
import type { Doc } from "@/convex/_generated/dataModel";

// =============================================================================
// Types
// =============================================================================

export interface AuthContext {
  token: string;
  client: ConvexHttpClient;
}

export type AuthContextWithUser = AuthContext & {
  user: Doc<"users">;
};

// =============================================================================
// Server Auth Utilities
// =============================================================================

/**
 * Get the Convex deployment URL from environment
 */
function getConvexUrl(): string {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "Environment variable CONVEX_URL is missing. Please set it in your environment to the URL of your Convex deployment.",
    );
  }
  return url;
}

/**
 * Shared secret that proves a Convex call comes from these server routes rather than a
 * browser holding the same session token. Pass it to server-only Convex functions
 * (api_keys.getDecryptedKey, users.refundMessageCredit), which check it with
 * assertServerSecret in convex/lib/auth_helper.ts. Must match the Convex env value.
 */
export function getServerRouteSecret(): string {
  const secret = process.env.SERVER_ROUTE_SECRET;
  if (!secret) {
    throw new Error(
      "Environment variable SERVER_ROUTE_SECRET is missing. Set the same value in the web server env and in Convex (bunx convex env set SERVER_ROUTE_SECRET ...).",
    );
  }
  return secret;
}

/**
 * Extract the auth token from the Authorization header
 */
function extractAuthToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Create an authenticated Convex client with the given token
 */
function createAuthenticatedClient(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(getConvexUrl());
  client.setAuth(token);
  return client;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Helper to create JSON response
 */
export function json<T>(data: T, init?: ResponseInit): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

/**
 * Create unauthorized response
 */
export function unauthorized(message = "Unauthorized"): Response {
  return json({ error: message }, { status: 401 });
}

/**
 * Create not found response
 */
export function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

/**
 * Create bad request response
 */
export function badRequest(message = "Bad request"): Response {
  return json({ error: message }, { status: 400 });
}

// =============================================================================
// Auth Middleware
// =============================================================================

/**
 * Auth middleware that extracts token and creates authenticated Convex client.
 * Provides: { token, client } in context
 */
export const authMiddleware = createMiddleware().server(({ next, request }) => {
  const token = extractAuthToken(request);

  if (!token) {
    return unauthorized();
  }

  const client = createAuthenticatedClient(token);

  return next({
    context: {
      token,
      client,
    },
  });
});
