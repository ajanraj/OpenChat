import { posthog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";

import { useUser } from "./user-provider";

// Identifies the signed-in user by internal account ID only; name and email never go to
// analytics (the Privacy Policy promises this). Resets the session after sign-out.
const PostHogIdentify = () => {
  const userInfo = useUser();

  useEffect(() => {
    if (userInfo.user) {
      try {
        if (userInfo.user._id !== "") {
          posthog.identify(userInfo.user._id, {
            isAnonymous: userInfo.user.isAnonymous,
          });
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
