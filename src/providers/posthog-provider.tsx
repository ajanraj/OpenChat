import { posthog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";

import { useUser } from "./user-provider";
import type { UserProfile } from "./user-provider";

// Define types for PostHog user properties
interface PostHogUserProperties {
  email?: string;
  name?: string;
  isAnonymous?: boolean;
}

const hasText = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

// Validate user properties before accessing them
const validateUserProperties = (user: UserProfile): PostHogUserProperties => ({
  email: hasText(user.email) ? user.email : undefined,
  name: [user.name, user.preferredName].find(hasText),
  isAnonymous: user.isAnonymous,
});

// Identifies the signed-in user (or resets the session after sign-out); renders nothing
const PostHogIdentify = () => {
  const userInfo = useUser();

  useEffect(() => {
    if (userInfo.user) {
      try {
        // Validate user properties before using them
        const userProperties = validateUserProperties(userInfo.user);

        // Only identify if we have a valid user ID
        if (userInfo.user._id !== "") {
          posthog.identify(userInfo.user._id, userProperties);
        }
      } catch (error) {
        console.error("PostHog: Failed to identify user:", error);
      }
    } else {
      try {
        posthog.reset();
      } catch (error) {
        console.error("PostHog: Failed to reset user session:", error);
      }
    }
  }, [userInfo.user]);

  return null;
};

export const CSPostHogProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <PostHogProvider client={posthog}>
    {children}
    {/* After children, so its effect still runs after theirs, as when it wrapped them */}
    <PostHogIdentify />
  </PostHogProvider>
);
