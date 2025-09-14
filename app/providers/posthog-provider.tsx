"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { type UserProfile, useUser } from "./user-provider";

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <PostHogAuthWrapper>{children}</PostHogAuthWrapper>
    </PostHogProvider>
  );
}

// Define types for PostHog user properties
type PostHogUserProperties = {
  email?: string;
  name?: string;
  isAnonymous?: boolean;
};

// Validate user properties before accessing them
function validateUserProperties(user: UserProfile): PostHogUserProperties {
  return {
    email: user.email || undefined,
    name: user.name || user.preferredName || undefined,
    isAnonymous: user.isAnonymous,
  };
}

function PostHogAuthWrapper({ children }: { children: React.ReactNode }) {
  const userInfo = useUser();

  useEffect(() => {
    if (userInfo.user) {
      try {
        // Validate user properties before using them
        const userProperties = validateUserProperties(userInfo.user);

        // Only identify if we have a valid user ID
        if (userInfo.user._id) {
          posthog.identify(userInfo.user._id, userProperties);
        } else {
          // console.warn('PostHog: User ID is missing, skipping identification');
        }
      } catch (_error) {
        // console.error('PostHog: Failed to identify user', error);
        // Optionally, you could report this error to your error tracking service
      }
    } else {
      try {
        posthog.reset();
      } catch (_error) {
        // console.error('PostHog: Failed to reset user session', error);
      }
    }
  }, [userInfo.user]);

  return children;
}
