import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";

const convexUrl: unknown = import.meta.env.VITE_CONVEX_URL;
if (typeof convexUrl !== "string") {
  throw new TypeError(
    "VITE_CONVEX_URL is not set; add your Convex deployment URL to the environment."
  );
}
const client = new ConvexReactClient(convexUrl);

/**
 * The app's QueryClient, wired so convexQuery() keys are fetched and kept live through `client`.
 * getRouter creates one per router (once in the browser, per request on the server), and the
 * router's SSR query integration provides it to the app.
 */
export const createConvexQueryClient = () => {
  const convexQueryClient = new ConvexQueryClient(client);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Convex query configuration
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        // Cache time: Data stays in cache for 10 minutes after becoming unused
        gcTime: 10 * 60 * 1000,
        // Data is considered fresh for 30 seconds - reduces redundant requests
        staleTime: 30 * 1000,
        // Prevent refetching when user switches tabs - Convex handles real-time updates
        refetchOnWindowFocus: false,
      },
    },
  });

  // Connect ConvexQueryClient to QueryClient
  convexQueryClient.connect(queryClient);

  return queryClient;
};

export const ConvexProvider = ({ children }: { children: React.ReactNode }) => (
  <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>
);
