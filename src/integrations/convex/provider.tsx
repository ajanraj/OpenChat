import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { useState } from "react";

const client = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const convexQueryClient = new ConvexQueryClient(client);

    const tanstackQueryClient = new QueryClient({
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
    convexQueryClient.connect(tanstackQueryClient);

    return tanstackQueryClient;
  });

  return (
    <ConvexAuthProvider client={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexAuthProvider>
  );
}
