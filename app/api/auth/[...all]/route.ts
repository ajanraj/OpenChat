import { nextJsHandler } from "@convex-dev/better-auth/nextjs";

// Export GET and POST handlers for Better Auth
// This handles all auth routes like /api/auth/signin, /api/auth/callback/google, etc.
export const { GET, POST } = nextJsHandler();
