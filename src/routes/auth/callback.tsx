import { useAuthToken } from "@convex-dev/auth/react";
import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/prompt-kit/loader";
import { api } from "@/convex/_generated/api";
import { getConnectorConfig } from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { useUser } from "@/providers/user-provider";

type CallbackStatus = "checking" | "success" | "error";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthenticatedCallback() {
  const authToken = useAuthToken();
  const router = useRouter();
  const search = useSearch({ from: "/auth/callback" });
  const { user } = useUser();
  const [status, setStatus] = useState<CallbackStatus>("checking");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveConnection = useMutation(api.connectors.saveConnection);

  // Helper function to handle redirects with proper cleanup
  const redirectAfterDelay = useCallback(
    (path: string, delay: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        void router.navigate({ to: path });
      }, delay);
    },
    [router],
  );

  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCallback = useCallback(async () => {
    const requestHeaders = authToken
      ? {
          Authorization: `Bearer ${authToken}`,
        }
      : undefined;

    try {
      const connectorType = (search as { type?: string }).type as ConnectorType;

      if (!connectorType) {
        toast.error("Missing connector type");
        setStatus("error");
        redirectAfterDelay("/settings/connectors", 3000);
        return;
      }

      if (!user) {
        return;
      }

      // Redirect if no user or anonymous user - they can't complete OAuth callbacks
      if (user.isAnonymous) {
        toast.error("Please sign in with Google to connect external services");
        setStatus("error");
        redirectAfterDelay("/", 3000);
        return;
      }

      // Get connectionRequestId from sessionStorage
      const connectionRequestId = sessionStorage.getItem(`composio_connection_${connectorType}`);

      if (!connectionRequestId) {
        toast.error("Missing connection request ID");
        setStatus("error");
        redirectAfterDelay("/settings/connectors", 3000);
        return;
      }

      // Clean up sessionStorage
      sessionStorage.removeItem(`composio_connection_${connectorType}`);

      // Wait for connection verification (this will wait for up to 60 seconds)
      const response = await fetch(
        `/api/composio/status?connectionRequestId=${connectionRequestId}`,
        {
          headers: requestHeaders,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        toast.error(`Failed to verify connection: ${errorData.error}`);
        setStatus("error");
        redirectAfterDelay("/settings/connectors", 3000);
        return;
      }

      const data = await response.json();

      if (data.isConnected) {
        // Save to Convex (user is guaranteed to exist in Authenticated component)
        if (user) {
          await saveConnection({
            type: connectorType,
            connectionId: data.connectionId,
          });
        }

        const connectorConfig = getConnectorConfig(connectorType);
        toast.success(`${connectorConfig.displayName} connected successfully`);
        setStatus("success");

        // Redirect back to connectors page after 1 second
        redirectAfterDelay("/settings/connectors", 1000);
      } else {
        toast.error("Connection verification failed");
        setStatus("error");
        redirectAfterDelay("/settings/connectors", 3000);
      }
    } catch {
      // Only show failed for genuine errors (like network failures, timeouts, etc.)
      toast.error("Failed to complete connection");
      setStatus("error");

      // Redirect back after 3 seconds
      redirectAfterDelay("/settings/connectors", 3000);
    }
  }, [authToken, search, user, saveConnection, redirectAfterDelay]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void handleCallback();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [handleCallback]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === "checking" && (
          <>
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-primary border-b-2" />
            <p>Please wait, we are verifying your connection...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="mb-4 text-4xl text-green-500">✓</div>
            <p>Connection successful! Redirecting...</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mb-4 text-4xl text-red-500">✗</div>
            <p>Connection failed. Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
}

function AuthCallbackPage() {
  return (
    <>
      {/* Auth Loading State */}
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <Loader size="lg" variant="dots" />
            <p className="mt-4">Loading...</p>
          </div>
        </div>
      </AuthLoading>

      {/* Unauthenticated State - redirect to home */}
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>

      {/* Authenticated State */}
      <Authenticated>
        <AuthenticatedCallback />
      </Authenticated>
    </>
  );
}

function UnauthenticatedRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home if not authenticated
    const timeoutId = setTimeout(() => {
      void router.navigate({ to: "/" });
    }, 2000);

    // Cleanup timeout on unmount
    return () => {
      clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-4xl text-red-500">✗</div>
        <p>Authentication required. Redirecting to home...</p>
      </div>
    </div>
  );
}
