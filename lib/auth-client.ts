import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Create the Better Auth client for frontend use
export const authClient = createAuthClient({
  plugins: [
    convexClient(), // Convex integration
    anonymousClient(), // Anonymous authentication support
  ],
});
