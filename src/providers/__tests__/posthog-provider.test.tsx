import { render } from "@testing-library/react";
import { posthog } from "posthog-js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Id } from "../../../convex/_generated/dataModel";
import { CSPostHogProvider } from "../posthog-provider";
import type { useUser } from "../user-provider";

const useUserMock = vi.hoisted(() => vi.fn<typeof useUser>());

vi.mock(import("../user-provider"), () => ({
  useUser: useUserMock,
}));

const userId = z
  .custom<Id<"users">>((value) => typeof value === "string")
  .parse("user_1");

const noop = async () => {
  // Never called here
};

describe(CSPostHogProvider, () => {
  // The Privacy Policy says analytics never receive name or email.
  it("identifies a signed-in user by account ID only", () => {
    const identify = vi.spyOn(posthog, "identify").mockReturnValue();
    useUserMock.mockReturnValue({
      user: {
        _id: userId,
        _creationTime: 1,
        email: "ada@example.com",
        isAnonymous: false,
        name: "Ada",
        preferredName: "Ada L",
      },
      isLoading: false,
      ensureSession: noop,
      signInGoogle: noop,
      signOut: noop,
      updateUser: noop,
      hasPremium: false,
      rateLimitStatus: undefined,
      apiKeys: [],
      hasApiKey: new Map(),
      hasOpenAI: false,
      hasAnthropic: false,
      hasGemini: false,
      isApiKeysLoading: false,
      connectors: [],
      isConnectorsLoading: false,
    });

    render(<CSPostHogProvider>{null}</CSPostHogProvider>);

    expect(identify).toHaveBeenCalledExactlyOnceWith("user_1", {
      isAnonymous: false,
    });
  });
});
