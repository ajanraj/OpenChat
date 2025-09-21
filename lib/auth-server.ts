import { getToken as getTokenNextjs } from "@convex-dev/better-auth/nextjs";
import { createAuth } from "../convex/auth";

// Helper function to get authentication token for server-side operations
export const getToken = () => {
  return getTokenNextjs(createAuth);
};
