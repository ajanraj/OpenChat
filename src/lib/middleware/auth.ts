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
const getConvexUrl = (): string => {
  const url = process.env.CONVEX_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "Environment variable CONVEX_URL is missing. Please set it in your environment to the URL of your Convex deployment."
    );
  }
  return url;
};

/**
 * Shared secret that proves a Convex call comes from these server routes rather than a
 * browser holding the same session token. Pass it to server-only Convex functions
 * (api_keys.getDecryptedKey, users.refundMessageCredit), which check it with
 * assertServerSecret in convex/lib/auth_helper.ts. Must match the Convex env value.
 */
export const getServerRouteSecret = (): string => {
  const secret = process.env.SERVER_ROUTE_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error(
      "Environment variable SERVER_ROUTE_SECRET is missing. Set the same value in the web server env and in Convex (bunx convex env set SERVER_ROUTE_SECRET ...)."
    );
  }
  return secret;
};

/**
 * Extract the auth token from the Authorization header
 */
const extractAuthToken = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ") !== true) {
    return null;
  }
  return authHeader.slice(7);
};

/**
 * Create an authenticated Convex client with the given token
 */
const createAuthenticatedClient = (token: string): ConvexHttpClient => {
  const client = new ConvexHttpClient(getConvexUrl());
  client.setAuth(token);
  return client;
};

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Helper to create JSON response
 */
export const json = (data: unknown, init?: ResponseInit): Response => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (init?.headers) {
    if (init.headers instanceof Headers || Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }

  return Response.json(data, {
    ...init,
    headers,
  });
};

/**
 * Create unauthorized response
 */
export const unauthorized = (message = "Unauthorized"): Response =>
  json({ error: message }, { status: 401 });

/**
 * Create not found response
 */
export const notFound = (message = "Not found"): Response =>
  json({ error: message }, { status: 404 });

/**
 * Create bad request response
 */
export const badRequest = (message = "Bad request"): Response =>
  json({ error: message }, { status: 400 });

// =============================================================================
// Auth Middleware
// =============================================================================

/**
 * Auth middleware that extracts token and creates authenticated Convex client.
 * Provides: { token, client } in context
 */
export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const token = extractAuthToken(request);

    if (token === null || token === "") {
      return unauthorized();
    }

    const client = createAuthenticatedClient(token);

    return await next({
      context: {
        token,
        client,
      },
    });
  }
);
